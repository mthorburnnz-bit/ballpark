import type { Scale } from "./types.ts";

/**
 * Pure scoring functions. No DOM, no state, no side effects.
 * f = range width as a fraction of the domain, measured in slider space
 * (linear space for linear questions, log space for log questions).
 */

export const TIGHT_THRESHOLD = 0.15;
export const MIN_HIT_SCORE = 5;
export const MAX_SCORE_PER_QUESTION = 100;
export const SCORE_EXPONENT = 1.5;
export const DAILY_MAX_SCORE = MAX_SCORE_PER_QUESTION * 5;

/** Map a real value into slider space for the given scale. */
export function toSliderSpace(value: number, scale: Scale): number {
  return scale === "log" ? Math.log10(value) : value;
}

/** Map a slider-space position back to a real value. */
export function fromSliderSpace(position: number, scale: Scale): number {
  return scale === "log" ? Math.pow(10, position) : position;
}

/**
 * Range width as a fraction of the domain width, in slider space.
 * This is what makes scoring scale-invariant across linear and log questions.
 */
export function widthFraction(
  lo: number,
  hi: number,
  domainMin: number,
  domainMax: number,
  scale: Scale,
): number {
  const loS = toSliderSpace(lo, scale);
  const hiS = toSliderSpace(hi, scale);
  const domainMinS = toSliderSpace(domainMin, scale);
  const domainMaxS = toSliderSpace(domainMax, scale);
  const domainWidth = domainMaxS - domainMinS;
  if (domainWidth <= 0) return 0;
  return (hiS - loS) / domainWidth;
}

export interface ScoreResult {
  hit: boolean;
  f: number;
  points: number;
  tight: boolean;
}

/**
 * Score a single answer. Miss = 0. Hit = round(100 * (1-f)^1.5), min 5.
 * Pinned examples (do not change without updating scoring.test.ts):
 *   f = 0.8 -> 9 pts
 *   f = 0.1 -> 85 pts
 */
export function scoreAnswer(
  lo: number,
  hi: number,
  value: number,
  domainMin: number,
  domainMax: number,
  scale: Scale,
): ScoreResult {
  const f = widthFraction(lo, hi, domainMin, domainMax, scale);
  const hit = value >= lo && value <= hi;

  if (!hit) {
    return { hit: false, f, points: 0, tight: false };
  }

  const points = Math.max(
    MIN_HIT_SCORE,
    Math.round(MAX_SCORE_PER_QUESTION * Math.pow(1 - f, SCORE_EXPONENT)),
  );
  const tight = f <= TIGHT_THRESHOLD;

  return { hit: true, f, points, tight };
}

/** Provisional score shown live while dragging, before the true value is known. */
export function provisionalScore(
  lo: number,
  hi: number,
  domainMin: number,
  domainMax: number,
  scale: Scale,
): number {
  const f = widthFraction(lo, hi, domainMin, domainMax, scale);
  return Math.max(MIN_HIT_SCORE, Math.round(MAX_SCORE_PER_QUESTION * Math.pow(1 - f, SCORE_EXPONENT)));
}
