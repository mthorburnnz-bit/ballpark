import { describe, it, expect } from "vitest";
import { computeTicks } from "./ticks.ts";

describe("computeTicks (linear)", () => {
  it("always anchors the first and last tick to the domain bounds", () => {
    const ticks = computeTicks(1, 30, "linear");
    expect(ticks[0]).toEqual({ value: 1, fraction: 0 });
    const last = ticks[ticks.length - 1]!;
    expect(last).toEqual({ value: 30, fraction: 1 });
  });
});

describe("computeTicks (log)", () => {
  it("keeps every power of ten for a modest span", () => {
    const ticks = computeTicks(100, 100000, "log");
    expect(ticks.map((t) => t.value)).toEqual([100, 1000, 10000, 100000]);
  });

  it("downsamples a many-decade span instead of showing every power of ten", () => {
    // rubiks-cube-combinations-style domain: 14 decades, one power of ten
    // each — showing all 15 would jam that many labels onto the track.
    const ticks = computeTicks(1e12, 1e26, "log");
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]!.value).toBe(1e12);
    // Math.pow(10, 26) isn't bit-identical to the 1e26 literal — compare by
    // ratio rather than exact equality.
    expect(ticks[ticks.length - 1]!.value / 1e26).toBeCloseTo(1, 9);
    // Strictly increasing, no accidental duplicate picks.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.value).toBeGreaterThan(ticks[i - 1]!.value);
    }
  });

  it("downsamples a 6-7 decade span (e.g. age-of-universe-years) too", () => {
    const ticks = computeTicks(1_000_000, 1_000_000_000_000, "log");
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]!.value).toBe(1_000_000);
    expect(ticks[ticks.length - 1]!.value).toBe(1_000_000_000_000);
  });
});
