import { describe, it, expect } from "vitest";
import { buildShareText } from "./share.ts";
import type { AnswerRecord } from "../state/save.ts";

function answer(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    questionId: "q",
    lo: 0,
    hi: 10,
    hit: true,
    f: 0.3,
    tight: false,
    points: 50,
    category: "geography",
    trueValue: 5,
    ...overrides,
  };
}

describe("buildShareText", () => {
  it("matches the spec §6 format: one emoji per question, points, verdict, url", () => {
    const answers = [
      answer({ tight: true, hit: true }),
      answer({ tight: true, hit: true }),
      answer({ hit: true, tight: false }),
      answer({ hit: false, tight: false, points: 0 }),
      answer({ hit: true, tight: false }),
    ];
    const text = buildShareText(241, answers, "Overconfident about geography", 312);
    expect(text).toBe(
      "Ballpark #241 ⚾\n🎯🎯✅❌✅  312 pts\nOverconfident about geography\nballpark.game",
    );
  });

  it("never reveals which questions were hits/misses beyond the emoji row", () => {
    const answers = [answer({ hit: false, points: 0 })];
    const text = buildShareText(1, answers, "Confidently wrong today", 0);
    expect(text).not.toContain("q"); // no questionId leakage
    expect(text.split("\n")).toHaveLength(4);
  });
});
