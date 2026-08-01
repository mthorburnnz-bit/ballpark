/** Thin client for the Worker API. All scoring happens server-side —
 * see worker/index.ts. Network is required to reveal any question. */

/** Community aggregates for this question, from every other player's real
 * (non-practice) submission on record. `sampleSize` 0 means nobody else has
 * answered yet — the rate/average fields are null in that case. */
export interface QuestionStats {
  sampleSize: number;
  hitRate: number | null;
  tightRate: number | null;
  avgLo: number | null;
  avgHi: number | null;
}

export interface RevealApiResult {
  hit: boolean;
  f: number;
  tight: boolean;
  points: number;
  trueValue: number;
  funFact: string;
  source: string;
  stats: QuestionStats;
}

export class ApiError extends Error {}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore — use the generic message
    }
    throw new ApiError(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchReveal(questionId: string, lo: number, hi: number): Promise<RevealApiResult> {
  const res = await fetch("/api/reveal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questionId, lo, hi }),
  });
  return parseOrThrow<RevealApiResult>(res);
}

export interface SubmitDayAnswer {
  questionId: string;
  lo: number;
  hi: number;
}

export interface SubmitDayResult {
  total: number;
  alreadySubmitted: boolean;
}

export async function submitDay(
  playerId: string,
  playerName: string,
  date: string,
  puzzleNumber: number,
  answers: SubmitDayAnswer[],
): Promise<SubmitDayResult> {
  const res = await fetch("/api/submit-day", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, playerName, date, puzzleNumber, answers }),
  });
  return parseOrThrow<SubmitDayResult>(res);
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  total: number;
  daysPlayed: number;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch("/api/leaderboard");
  const data = await parseOrThrow<{ leaderboard: LeaderboardEntry[] }>(res);
  return data.leaderboard;
}
