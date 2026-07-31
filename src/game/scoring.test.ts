import { describe, it, expect } from "vitest";
import {
  widthFraction,
  scoreAnswer,
  toSliderSpace,
  fromSliderSpace,
  TIGHT_THRESHOLD,
  MIN_HIT_SCORE,
} from "./scoring.ts";

describe("toSliderSpace / fromSliderSpace", () => {
  it("linear is identity", () => {
    expect(toSliderSpace(42, "linear")).toBe(42);
    expect(fromSliderSpace(42, "linear")).toBe(42);
  });

  it("log maps via log10 and back", () => {
    expect(toSliderSpace(1000, "log")).toBeCloseTo(3);
    expect(fromSliderSpace(3, "log")).toBeCloseTo(1000);
  });
});

describe("widthFraction", () => {
  it("computes fraction of domain in linear space", () => {
    // domain 0-100, range 0-80 -> f = 0.8
    expect(widthFraction(0, 80, 0, 100, "linear")).toBeCloseTo(0.8);
    // domain 0-100, range 0-10 -> f = 0.1
    expect(widthFraction(0, 10, 0, 100, "linear")).toBeCloseTo(0.1);
  });

  it("computes fraction of domain in log space", () => {
    // domain 1-1,000,000 (6 decades). range 1-1000 = 3 decades -> f = 0.5
    expect(widthFraction(1, 1000, 1, 1_000_000, "log")).toBeCloseTo(0.5);
  });
});

describe("scoreAnswer — pinned example values from spec §5.5", () => {
  it("f = 0.8 -> 9 pts (coward range still scores something)", () => {
    // domain 0-100, value 40 inside [0,80]
    const result = scoreAnswer(0, 80, 40, 0, 100, "linear");
    expect(result.hit).toBe(true);
    expect(result.f).toBeCloseTo(0.8);
    expect(result.points).toBe(9);
    expect(result.tight).toBe(false);
  });

  it("f = 0.1 -> 85 pts (tight, richly rewarded)", () => {
    // domain 0-100, value 5 inside [0,10]
    const result = scoreAnswer(0, 10, 5, 0, 100, "linear");
    expect(result.hit).toBe(true);
    expect(result.f).toBeCloseTo(0.1);
    expect(result.points).toBe(85);
    expect(result.tight).toBe(true); // f=0.1 <= 0.15 threshold
  });

  it("miss scores exactly 0 regardless of range width", () => {
    const result = scoreAnswer(0, 10, 50, 0, 100, "linear");
    expect(result.hit).toBe(false);
    expect(result.points).toBe(0);
    expect(result.tight).toBe(false);
  });

  it("a hit never scores below the minimum of 5", () => {
    // domain 0-100, range covers 99% of it
    const result = scoreAnswer(0, 99, 50, 0, 100, "linear");
    expect(result.hit).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(MIN_HIT_SCORE);
  });

  it("boundary values count as a hit (inclusive)", () => {
    expect(scoreAnswer(10, 20, 10, 0, 100, "linear").hit).toBe(true);
    expect(scoreAnswer(10, 20, 20, 0, 100, "linear").hit).toBe(true);
  });

  it("tight threshold is f <= 0.15", () => {
    const atThreshold = scoreAnswer(0, 15, 5, 0, 100, "linear");
    expect(atThreshold.f).toBeCloseTo(0.15);
    expect(atThreshold.tight).toBe(true);

    const justOver = scoreAnswer(0, 15.1, 5, 0, 100, "linear");
    expect(justOver.tight).toBe(false);
  });

  it("scores identically in spirit for an equivalent log-scale question", () => {
    // domain 1 - 1,000,000 (6 decades), value 1000, range covering 10% of domain = 0.6 decades
    // 10^0.6 ≈ 3.98, so range roughly [251, 1000*3.98] etc. Just assert f and hit behave.
    const result = scoreAnswer(631, 1585, 1000, 1, 1_000_000, "log");
    expect(result.hit).toBe(true);
    expect(result.f).toBeCloseTo(0.1, 1);
  });
});

describe("TIGHT_THRESHOLD export", () => {
  it("is 0.15", () => {
    expect(TIGHT_THRESHOLD).toBe(0.15);
  });
});
