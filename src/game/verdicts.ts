import type { Category } from "./types.ts";
import { DAILY_MAX_SCORE } from "./scoring.ts";

export interface VerdictInput {
  category: Category;
  hit: boolean;
  f: number;
  tight: boolean;
  points: number;
}

const SHARP_SCORE_THRESHOLD = 400;
const SAFE_MEAN_F_THRESHOLD = 0.5;
const CALIBRATED_MEAN_F_THRESHOLD = 0.2;

/**
 * Pure verdict rule engine. Rule order matters — first match wins.
 * Mirrors spec §5.6 exactly; keep in that order when adding new rules.
 */
export function computeVerdict(results: readonly VerdictInput[]): string {
  const hits = results.filter((r) => r.hit);
  const misses = results.filter((r) => !r.hit);
  const totalScore = results.reduce((sum, r) => sum + r.points, 0);
  const meanF = hits.length > 0 ? hits.reduce((sum, r) => sum + r.f, 0) / hits.length : 0;
  const tightCount = results.filter((r) => r.tight).length;

  // 1. 5 hits, mean f <= 0.2
  if (hits.length === 5 && meanF <= CALIBRATED_MEAN_F_THRESHOLD) {
    return "Dangerously well-calibrated";
  }

  // 2. 5 hits, mean f > 0.5
  if (hits.length === 5 && meanF > SAFE_MEAN_F_THRESHOLD) {
    return "Playing it very safe";
  }

  // 3. >= 2 misses in one category
  const missesByCategory = new Map<Category, number>();
  for (const r of misses) {
    missesByCategory.set(r.category, (missesByCategory.get(r.category) ?? 0) + 1);
  }
  for (const [category, count] of missesByCategory) {
    if (count >= 2) {
      return `Overconfident about ${category}`;
    }
  }

  // 4. >= 3 misses total
  if (misses.length >= 3) {
    return "Confidently wrong today";
  }

  // 5. exactly 5 tight hits
  if (tightCount === 5) {
    return "Are you cheating or are you a savant?";
  }

  // 6. score >= 400
  if (totalScore >= SHARP_SCORE_THRESHOLD) {
    return "Sharp today";
  }

  // 7. default
  return "Respectably calibrated";
}

export function totalScore(results: readonly VerdictInput[]): number {
  return Math.min(DAILY_MAX_SCORE, results.reduce((sum, r) => sum + r.points, 0));
}
