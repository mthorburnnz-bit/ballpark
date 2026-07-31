import type { Question, Category } from "./types.ts";

/** Player's local calendar date, YYYY-MM-DD. This game rolls over at local
 * midnight, not UTC — see spec §5.4: the social unit is a timezone-local group. */
export function todayLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function puzzleNumberForDate(dateStr: string, launchDate: string): number {
  const launch = new Date(`${launchDate}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((target.getTime() - launch.getTime()) / 86_400_000);
  return diffDays + 1; // launch day = puzzle #1
}

function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from the date so a given date
 * always resolves to the same fallback set, for every player. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_PER_CATEGORY = 2;

/**
 * Seeded-random fallback so an unscheduled date still resolves to a valid
 * five-question set (spec §3.2: "the game can never break"). Respects the
 * max-two-per-category curation rule on a best-effort basis. Pure function
 * of (dateStr, bank) so it's usable from both the browser app and the
 * Node-based content linter with no Vite dependency.
 */
export function fallbackQuestionsForDate(dateStr: string, bank: readonly Question[]): Question[] {
  const rng = mulberry32(hashString(dateStr));
  const pool = [...bank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = pool[i]!;
    const b = pool[j]!;
    pool[i] = b;
    pool[j] = a;
  }

  const picked: Question[] = [];
  const categoryCounts = new Map<Category, number>();
  for (const q of pool) {
    if (picked.length >= 5) break;
    const count = categoryCounts.get(q.category) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;
    picked.push(q);
    categoryCounts.set(q.category, count + 1);
  }
  if (picked.length < 5) {
    for (const q of pool) {
      if (picked.length >= 5) break;
      if (!picked.includes(q)) picked.push(q);
    }
  }
  return picked;
}

export function questionsForDate(
  dateStr: string,
  schedule: Record<string, string[]>,
  bank: readonly Question[],
  questionsById: ReadonlyMap<string, Question>,
): Question[] {
  const ids = schedule[dateStr];
  if (ids && ids.length === 5) {
    const resolved = ids.map((id) => questionsById.get(id));
    if (resolved.every((q): q is Question => q !== undefined)) {
      return resolved;
    }
  }
  return fallbackQuestionsForDate(dateStr, bank);
}

export function isDateScheduled(dateStr: string, schedule: Record<string, string[]>): boolean {
  return Boolean(schedule[dateStr]);
}
