/** Below this many other submissions for the day, a percentile is noise —
 * "you beat 100% of players" when there's one other player isn't a
 * meaningful signal, so it's withheld rather than shown misleadingly. */
export const MIN_SAMPLES_FOR_PERCENTILE = 5;

/**
 * "You beat X% of players today" — the share of that day's *other*
 * submissions with a strictly lower score. `lowerCount` and `total` both
 * exclude the player's own submission (the caller is expected to have
 * already filtered it out).
 */
export function computePercentile(lowerCount: number, total: number): number | null {
  if (total < MIN_SAMPLES_FOR_PERCENTILE) return null;
  return Math.round((lowerCount / total) * 100);
}
