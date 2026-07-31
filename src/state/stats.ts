import type { Category } from "../game/types.ts";
import type { SaveData, DayProgress } from "./save.ts";
import { persistSave } from "./save.ts";

function previousLocalDateString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Rolls a just-completed day's answers into the streak and lifetime stats.
 * Idempotent per day via `statsRecorded` — safe to call every time a day's
 * state is observed to be "complete" without double-counting on refresh.
 */
export function recordDayCompletion(save: SaveData, date: string): void {
  const day = save.days[date];
  if (!day || day.state !== "complete" || day.statsRecorded) return;

  const answers = day.answers.filter((a): a is NonNullable<typeof a> => a !== null);

  // Streak
  const expectedPrevious = previousLocalDateString(date);
  if (save.streak.lastCompletedDate === expectedPrevious) {
    save.streak.current += 1;
  } else if (save.streak.lastCompletedDate !== date) {
    save.streak.current = 1;
  }
  save.streak.best = Math.max(save.streak.best, save.streak.current);
  save.streak.lastCompletedDate = date;

  // Lifetime stats
  save.lifetime.gamesPlayed += 1;
  for (const a of answers) {
    save.lifetime.totalScore += a.points;
    save.lifetime.totalQuestions += 1;
    if (a.hit) save.lifetime.totalHits += 1;
    if (a.tight) save.lifetime.totalTight += 1;

    const catStat = save.lifetime.categoryTotals[a.category] ?? { questions: 0, hits: 0 };
    catStat.questions += 1;
    if (a.hit) catStat.hits += 1;
    save.lifetime.categoryTotals[a.category] = catStat;
  }

  day.statsRecorded = true;
  persistSave(save);
}

export interface DerivedStats {
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
  averageScore: number;
  hitRate: number; // 0..1
  tightHitRate: number; // 0..1
  categoryHitRates: Array<{ category: Category; hitRate: number; questions: number }>;
}

export function deriveStats(save: SaveData): DerivedStats {
  const { lifetime, streak } = save;
  const averageScore = lifetime.gamesPlayed > 0 ? lifetime.totalScore / lifetime.gamesPlayed : 0;
  const hitRate = lifetime.totalQuestions > 0 ? lifetime.totalHits / lifetime.totalQuestions : 0;
  const tightHitRate = lifetime.totalQuestions > 0 ? lifetime.totalTight / lifetime.totalQuestions : 0;

  const categoryHitRates = Object.entries(lifetime.categoryTotals).map(([category, stat]) => ({
    category: category as Category,
    hitRate: stat.questions > 0 ? stat.hits / stat.questions : 0,
    questions: stat.questions,
  }));
  categoryHitRates.sort((a, b) => b.questions - a.questions);

  return {
    currentStreak: streak.current,
    bestStreak: streak.best,
    gamesPlayed: lifetime.gamesPlayed,
    averageScore,
    hitRate,
    tightHitRate,
    categoryHitRates,
  };
}

export function dayScore(day: DayProgress): number {
  return day.answers.reduce((sum, a) => sum + (a?.points ?? 0), 0);
}
