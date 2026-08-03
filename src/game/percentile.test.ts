import { describe, it, expect } from "vitest";
import { computePercentile, MIN_SAMPLES_FOR_PERCENTILE } from "./percentile.ts";

describe("computePercentile", () => {
  it("returns null below the minimum sample size", () => {
    expect(computePercentile(0, MIN_SAMPLES_FOR_PERCENTILE - 1)).toBeNull();
  });

  it("returns 100 when beating everyone else at exactly the threshold", () => {
    expect(computePercentile(MIN_SAMPLES_FOR_PERCENTILE, MIN_SAMPLES_FOR_PERCENTILE)).toBe(100);
  });

  it("returns 0 when beating no one", () => {
    expect(computePercentile(0, MIN_SAMPLES_FOR_PERCENTILE)).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    expect(computePercentile(4, 6)).toBe(67); // 66.67 -> 67
    expect(computePercentile(2, 6)).toBe(33); // 33.33 -> 33
  });
});
