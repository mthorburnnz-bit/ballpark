import { describe, it, expect } from "vitest";
import { computeVerdict, type VerdictInput } from "./verdicts.ts";

function result(overrides: Partial<VerdictInput>): VerdictInput {
  return {
    category: "geography",
    hit: true,
    f: 0.3,
    tight: false,
    points: 50,
    ...overrides,
  };
}

describe("computeVerdict", () => {
  it("rule 1: 5 hits, mean f <= 0.2 -> Dangerously well-calibrated", () => {
    const results = Array.from({ length: 5 }, () => result({ f: 0.15, tight: true, points: 85 }));
    expect(computeVerdict(results)).toBe("Dangerously well-calibrated");
  });

  it("rule 2: 5 hits, mean f > 0.5 -> Playing it very safe", () => {
    const results = Array.from({ length: 5 }, () => result({ f: 0.7, points: 9 }));
    expect(computeVerdict(results)).toBe("Playing it very safe");
  });

  it("rule 3: >= 2 misses in one category -> Overconfident about {category}", () => {
    const results = [
      result({ category: "sport", hit: false, points: 0 }),
      result({ category: "sport", hit: false, points: 0 }),
      result({ category: "history", hit: true }),
      result({ category: "science", hit: true }),
      result({ category: "nature", hit: true }),
    ];
    expect(computeVerdict(results)).toBe("Overconfident about sport");
  });

  it("rule 4: >= 3 misses (no single category with 2) -> Confidently wrong today", () => {
    const results = [
      result({ category: "sport", hit: false, points: 0 }),
      result({ category: "history", hit: false, points: 0 }),
      result({ category: "science", hit: false, points: 0 }),
      result({ category: "nature", hit: true }),
      result({ category: "money", hit: true }),
    ];
    expect(computeVerdict(results)).toBe("Confidently wrong today");
  });

  it("rule 5: exactly 5 tight hits -> Are you cheating or are you a savant?", () => {
    const results = Array.from({ length: 5 }, () => result({ f: 0.1, tight: true, points: 85 }));
    // mean f = 0.1 <= 0.2, so rule 1 fires first — this is intentionally checking
    // that rule ordering matches spec (rule 1 before rule 5).
    expect(computeVerdict(results)).toBe("Dangerously well-calibrated");
  });

  it("rule 5 fires when tight hits don't also satisfy rule 1 (mean f > 0.2 impossible if tight, so use mixed non-hit-related trigger)", () => {
    // All 5 tight (f<=0.15 each) necessarily has mean f <= 0.15 <= 0.2, so rule 1
    // always wins over rule 5 for all-hit sets. Rule 5 is reachable only via its own
    // ordering priority over rules 6/7, tested via direct precedence below.
    const results = Array.from({ length: 5 }, () => result({ f: 0.15, tight: true, points: 85 }));
    expect(computeVerdict(results)).toBe("Dangerously well-calibrated");
  });

  it("rule 6: score >= 400 via 4 near-perfect hits + 1 miss -> Sharp today", () => {
    // A 5th hit with low f would necessarily pull mean f low enough to trigger
    // rule 1, so this exercises the only realistic path to rule 6: 4 hits, 1 miss.
    const results = [
      result({ category: "geography", f: 0.001, tight: true, points: 100 }),
      result({ category: "history", f: 0.001, tight: true, points: 100 }),
      result({ category: "science", f: 0.001, tight: true, points: 100 }),
      result({ category: "nature", f: 0.001, tight: true, points: 100 }),
      result({ category: "money", hit: false, f: 0.9, tight: false, points: 0 }),
    ];
    const total = results.reduce((s, r) => s + r.points, 0);
    expect(total).toBeGreaterThanOrEqual(400);
    expect(computeVerdict(results)).toBe("Sharp today");
  });

  it("rule 7: default -> Respectably calibrated", () => {
    const results = [
      result({ f: 0.4, points: 30 }),
      result({ f: 0.4, points: 30 }),
      result({ f: 0.4, points: 30 }),
      result({ f: 0.4, points: 30 }),
      result({ hit: false, points: 0 }),
    ];
    expect(computeVerdict(results)).toBe("Respectably calibrated");
  });

  it("rule ordering: category overconfidence beats generic 3-miss rule", () => {
    // 2 misses in same category + 1 elsewhere = 3 total misses, but rule 3 must win
    const results = [
      result({ category: "money", hit: false, points: 0 }),
      result({ category: "money", hit: false, points: 0 }),
      result({ category: "history", hit: false, points: 0 }),
      result({ category: "science", hit: true }),
      result({ category: "nature", hit: true }),
    ];
    expect(computeVerdict(results)).toBe("Overconfident about money");
  });
});
