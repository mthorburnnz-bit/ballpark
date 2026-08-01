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
    save.lifetime.totalWidthFraction += a.f;
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

/** Below this many lifetime answers, a confidence score is too noisy to be
 * meaningful (a couple of lucky/unlucky questions can swing it wildly). */
export const MIN_SAMPLES_FOR_CONFIDENCE = 10;

/** Gap (hit rate minus average range width, both 0..1) within which we call
 * a player "calibrated" rather than over/underconfident — avoids flip-flopping
 * the label off single-question noise near the boundary. */
const CALIBRATED_BAND = 0.05;

export interface ConfidenceInsight {
  label: "overconfident" | "underconfident" | "calibrated";
  avgWidthPercent: number; // 0..100, rounded
  hitRatePercent: number; // 0..100, rounded
  gapPercent: number; // 0..100, rounded, always >= 0
}

export interface DerivedStats {
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
  averageScore: number;
  hitRate: number; // 0..1
  tightHitRate: number; // 0..1
  categoryHitRates: Array<{ category: Category; hitRate: number; questions: number }>;
  confidence: ConfidenceInsight | null;
}

/**
 * A player's range width `f` (fraction of the plausible domain their range
 * covers) doubles as an implied confidence level: a wide range is an
 * implicit bet that you're very likely to contain the truth, a narrow range
 * is a bet that you're less likely to — but will score more if right. A
 * well-calibrated player's actual hit rate should track their average width.
 * Hit rate well above average width means their narrow bets are landing more
 * than the width alone would predict — they're underconfident and could
 * safely go narrower for more points. Hit rate well below average width
 * means their ranges aren't as reliable as their width implies — overconfident.
 * This is a heuristic, not a rigorous statistical calibration test (it
 * assumes the true value is roughly uniformly likely across each question's
 * domain, which the content linter enforces loosely, not precisely) — framed
 * in the UI as a fun/directional signal, not a scientific claim.
 */
function deriveConfidence(lifetime: SaveData["lifetime"], hitRate: number): ConfidenceInsight | null {
  if (lifetime.totalQuestions < MIN_SAMPLES_FOR_CONFIDENCE) return null;

  const avgWidthFraction = lifetime.totalWidthFraction / lifetime.totalQuestions;
  const gap = hitRate - avgWidthFraction;
  const label = Math.abs(gap) < CALIBRATED_BAND ? "calibrated" : gap > 0 ? "underconfident" : "overconfident";

  return {
    label,
    avgWidthPercent: Math.round(avgWidthFraction * 100),
    hitRatePercent: Math.round(hitRate * 100),
    gapPercent: Math.round(Math.abs(gap) * 100),
  };
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
    confidence: deriveConfidence(lifetime, hitRate),
  };
}

export function dayScore(day: DayProgress): number {
  return day.answers.reduce((sum, a) => sum + (a?.points ?? 0), 0);
}
