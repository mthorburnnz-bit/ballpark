import type { Category } from "../game/types.ts";

export interface AnswerRecord {
  questionId: string;
  lo: number;
  hi: number;
  hit: boolean;
  f: number;
  tight: boolean;
  points: number;
  category: Category;
  trueValue: number; // from the server's /api/reveal response — never computed client-side
}

export type DayState = "inProgress" | "complete";

export interface DayProgress {
  date: string;
  questionIds: string[]; // snapshot of the 5 ids resolved for this date at day-start
  answers: (AnswerRecord | null)[]; // length 5; null = not yet answered
  currentIndex: number; // 0..5
  state: DayState;
  statsRecorded?: boolean; // guards against double-counting streak/lifetime stats
}

export interface StreakState {
  current: number;
  best: number;
  lastCompletedDate: string | null;
}

export interface SettingsState {
  reducedMotion: boolean;
  haptics: boolean;
  sound: boolean;
}

export interface CategoryStat {
  questions: number;
  hits: number;
}

export interface LifetimeStats {
  gamesPlayed: number;
  totalScore: number;
  totalQuestions: number;
  totalHits: number;
  totalTight: number;
  totalWidthFraction: number; // sum of `f` (range width as a fraction of domain) across all answers — see stats.ts's confidence score
  categoryTotals: Partial<Record<Category, CategoryStat>>;
}

export interface SaveData {
  version: number;
  days: Record<string, DayProgress>;
  streak: StreakState;
  settings: SettingsState;
  lifetime: LifetimeStats;
  hasSeenTutorial: boolean;
}

const STORAGE_KEY = "giveortake:save";
const CURRENT_VERSION = 1;

export function defaultSave(): SaveData {
  return {
    version: CURRENT_VERSION,
    days: {},
    streak: { current: 0, best: 0, lastCompletedDate: null },
    settings: { reducedMotion: false, haptics: true, sound: false },
    hasSeenTutorial: false,
    lifetime: {
      gamesPlayed: 0,
      totalScore: 0,
      totalQuestions: 0,
      totalHits: 0,
      totalTight: 0,
      totalWidthFraction: 0,
      categoryTotals: {},
    },
  };
}

/**
 * No prior schema versions exist yet — this is the seam for future migrations.
 * Unknown/missing fields are shallow-merged onto defaults so a partially
 * written save (e.g. an interrupted localStorage write) never crashes the app.
 */
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") return defaultSave();
  const data = raw as Partial<SaveData>;
  if (data.version !== CURRENT_VERSION) return defaultSave();
  const base = defaultSave();
  return {
    version: CURRENT_VERSION,
    days: data.days ?? base.days,
    streak: { ...base.streak, ...data.streak },
    settings: { ...base.settings, ...data.settings },
    lifetime: { ...base.lifetime, ...data.lifetime },
    hasSeenTutorial: data.hasSeenTutorial ?? base.hasSeenTutorial,
  };
}

let cached: SaveData | null = null;

export function loadSave(): SaveData {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? migrate(JSON.parse(raw)) : defaultSave();
  } catch {
    cached = defaultSave();
  }
  return cached;
}

export function persistSave(data: SaveData): void {
  cached = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private browsing, quota) — in-memory state still
    // works for the rest of the session, it just won't survive a refresh.
  }
}

/** Resumes an in-progress day untouched, or starts a fresh one for `date`. */
export function getOrCreateDayProgress(save: SaveData, date: string, questionIds: string[]): DayProgress {
  const existing = save.days[date];
  if (existing) return existing;
  const fresh: DayProgress = {
    date,
    questionIds,
    answers: [null, null, null, null, null],
    currentIndex: 0,
    state: "inProgress",
  };
  save.days[date] = fresh;
  persistSave(save);
  return fresh;
}

export function recordAnswer(save: SaveData, date: string, index: number, answer: AnswerRecord): void {
  const day = save.days[date];
  if (!day) throw new Error(`No day progress for ${date}`);
  day.answers[index] = answer;
  day.currentIndex = index + 1;
  if (day.currentIndex >= day.questionIds.length) {
    day.state = "complete";
  }
  persistSave(save);
}
