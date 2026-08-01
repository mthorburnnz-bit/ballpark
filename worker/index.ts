import bundleData from "./generated/content-bundle.json";
import { scoreAnswer } from "../src/game/scoring.ts";
import type { Question } from "../src/game/types.ts";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
}

interface ContentBundle {
  questions: Question[];
  launchDate: string;
  schedule: Record<string, string[]>;
}

const bundle = bundleData as ContentBundle;
const questionsById = new Map<string, Question>(bundle.questions.map((q) => [q.id, q]));

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function badRequest(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

/**
 * Simple fixed-window counter in KV, keyed per IP per endpoint. Not
 * airtight under concurrent requests (KV reads/writes aren't atomic), but
 * that's fine here — the goal is deterring naive spam scripts against the
 * anonymous, login-free leaderboard, not withstanding a determined
 * distributed attacker.
 */
async function checkRateLimit(env: Env, bucket: string, ip: string, limit: number, windowSeconds: number): Promise<boolean> {
  const key = `rl:${bucket}:${ip}`;
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  if (count >= limit) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

function tooManyRequests(): Response {
  return json({ error: "Too many requests — please slow down and try again shortly." }, { status: 429 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

    if (url.pathname === "/api/reveal" && request.method === "POST") {
      // Generous: covers real daily play plus enthusiastic archive/practice replays.
      if (!(await checkRateLimit(env, "reveal", ip, 60, 600))) return tooManyRequests();
      return handleReveal(request, env);
    }
    if (url.pathname === "/api/submit-day" && request.method === "POST") {
      // Strict: a real player submits ~once a day. This just blocks scripted
      // spam of fake players/scores, not legitimate retries after a hiccup.
      if (!(await checkRateLimit(env, "submit", ip, 10, 3600))) return tooManyRequests();
      return handleSubmitDay(request, env);
    }
    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return handleLeaderboard(env);
    }

    return env.ASSETS.fetch(request);
  },
};

interface RevealBody {
  questionId?: unknown;
  lo?: unknown;
  hi?: unknown;
}

interface QuestionStats {
  sampleSize: number;
  hitRate: number | null;
  tightRate: number | null;
  avgLo: number | null;
  avgHi: number | null;
}

interface QuestionStatsRow {
  n: number;
  hits: number;
  tights: number;
  avgLo: number | null;
  avgHi: number | null;
}

/**
 * Aggregates every real (non-practice) submission on record for this
 * question — `question_answers` only ever gets rows from handleSubmitDay,
 * so archive/practice replays never pollute this. Global, not per-day: a
 * question that gets reused across multiple unscheduled dates (see the
 * seeded fallback in daily.ts) accrues stats across all of them.
 */
async function fetchQuestionStats(env: Env, questionId: string): Promise<QuestionStats> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as n, COALESCE(SUM(hit), 0) as hits, COALESCE(SUM(tight), 0) as tights,
            AVG(lo) as avgLo, AVG(hi) as avgHi
     FROM question_answers
     WHERE question_id = ?1`,
  )
    .bind(questionId)
    .first<QuestionStatsRow>();

  const n = row?.n ?? 0;
  if (n === 0) {
    return { sampleSize: 0, hitRate: null, tightRate: null, avgLo: null, avgHi: null };
  }
  return {
    sampleSize: n,
    hitRate: row!.hits / n,
    tightRate: row!.tights / n,
    avgLo: row!.avgLo,
    avgHi: row!.avgHi,
  };
}

/**
 * The true value for a question never ships to the client bundle (see
 * spec change: was AES-obfuscation-only, now the server just doesn't send
 * it). This endpoint is how the client learns hit/miss/points/trueValue
 * for a locked-in range — called for every question, real play or
 * practice/archive alike. No player identity is read or written; the
 * community stats returned are read-only aggregates of other players'
 * past submissions.
 */
async function handleReveal(request: Request, env: Env): Promise<Response> {
  let body: RevealBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const { questionId, lo, hi } = body;
  if (typeof questionId !== "string" || typeof lo !== "number" || typeof hi !== "number") {
    return badRequest("questionId (string), lo (number), hi (number) are required");
  }
  if (!(lo <= hi)) {
    return badRequest("lo must be <= hi");
  }

  const question = questionsById.get(questionId);
  if (!question) {
    return badRequest(`unknown questionId "${questionId}"`, 404);
  }

  const result = scoreAnswer(lo, hi, question.value, question.domainMin, question.domainMax, question.scale);
  const stats = await fetchQuestionStats(env, questionId);

  return json({
    hit: result.hit,
    f: result.f,
    tight: result.tight,
    points: result.points,
    trueValue: question.value,
    funFact: question.funFact,
    source: question.source,
    stats,
  });
}

interface AnswerInput {
  questionId: string;
  lo: number;
  hi: number;
}

interface SubmitDayBody {
  playerId?: unknown;
  playerName?: unknown;
  date?: unknown;
  puzzleNumber?: unknown;
  answers?: unknown;
}

function isAnswerInput(v: unknown): v is AnswerInput {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return typeof a.questionId === "string" && typeof a.lo === "number" && typeof a.hi === "number";
}

/**
 * Called once, after all 5 questions of a REAL (non-practice) day are
 * answered. Every answer is re-scored here from scratch against the
 * server's own copy of the true values — a client can never just POST a
 * fabricated score. `UNIQUE(player_id, date)` in the schema makes this
 * idempotent: a resubmission for a day already recorded is a silent no-op,
 * not an overwrite, so replaying a day can't inflate the leaderboard.
 */
async function handleSubmitDay(request: Request, env: Env): Promise<Response> {
  let body: SubmitDayBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const { playerId, playerName, date, puzzleNumber, answers } = body;

  if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
    return badRequest("invalid playerId");
  }
  if (typeof playerName !== "string" || playerName.trim().length === 0) {
    return badRequest("invalid playerName");
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest("invalid date, expected YYYY-MM-DD");
  }
  if (typeof puzzleNumber !== "number" || !Number.isInteger(puzzleNumber)) {
    return badRequest("invalid puzzleNumber");
  }
  if (!Array.isArray(answers) || answers.length !== 5 || !answers.every(isAnswerInput)) {
    return badRequest("answers must be an array of 5 {questionId, lo, hi} entries");
  }

  // Allow a day of timezone slack ahead of the server's UTC clock, reject
  // anything further out — this is a casual friends leaderboard, not a
  // security boundary, so we're not trying to pin exact player timezones.
  const maxAllowedDate = new Date();
  maxAllowedDate.setUTCDate(maxAllowedDate.getUTCDate() + 1);
  if (date > maxAllowedDate.toISOString().slice(0, 10)) {
    return badRequest("date is too far in the future");
  }

  const cleanName = playerName.trim().slice(0, 40);

  let total = 0;
  const scored: Array<AnswerInput & { hit: boolean; f: number; tight: boolean; points: number }> = [];

  for (const raw of answers) {
    if (!(raw.lo <= raw.hi)) {
      return badRequest(`lo must be <= hi for question ${raw.questionId}`);
    }
    const question = questionsById.get(raw.questionId);
    if (!question) {
      return badRequest(`unknown questionId "${raw.questionId}"`, 404);
    }
    const result = scoreAnswer(raw.lo, raw.hi, question.value, question.domainMin, question.domainMax, question.scale);
    total += result.points;
    scored.push({ ...raw, hit: result.hit, f: result.f, tight: result.tight, points: result.points });
  }

  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO players (id, name, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  )
    .bind(playerId, cleanName, now)
    .run();

  const insertScore = await env.DB.prepare(
    `INSERT OR IGNORE INTO daily_scores (player_id, date, puzzle_number, score, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(playerId, date, puzzleNumber, total, now)
    .run();

  const wasNewSubmission = (insertScore.meta.changes ?? 0) > 0;

  if (wasNewSubmission) {
    const inserts = scored.map((a, i) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO question_answers
         (player_id, date, question_index, question_id, lo, hi, hit, f, tight, points, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      ).bind(playerId, date, i, a.questionId, a.lo, a.hi, a.hit ? 1 : 0, a.f, a.tight ? 1 : 0, a.points, now),
    );
    await env.DB.batch(inserts);
  }

  // On a resubmission the write above is a no-op — return the score that's
  // actually stored, not a fresh recomputation from this request's (possibly
  // different, e.g. retried-with-stale-local-state) answers.
  let persistedTotal = total;
  if (!wasNewSubmission) {
    const existing = await env.DB.prepare(`SELECT score FROM daily_scores WHERE player_id = ?1 AND date = ?2`)
      .bind(playerId, date)
      .first<{ score: number }>();
    persistedTotal = existing?.score ?? total;
  }

  return json({ total: persistedTotal, alreadySubmitted: !wasNewSubmission });
}

interface LeaderboardRow {
  playerId: string;
  name: string;
  total: number;
  daysPlayed: number;
}

async function handleLeaderboard(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.id as playerId, p.name as name, SUM(ds.score) as total, COUNT(*) as daysPlayed
     FROM daily_scores ds
     JOIN players p ON p.id = ds.player_id
     GROUP BY p.id
     ORDER BY total DESC, daysPlayed ASC
     LIMIT 100`,
  ).all<LeaderboardRow>();

  return json({ leaderboard: results });
}
