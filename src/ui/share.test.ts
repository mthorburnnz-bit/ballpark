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
    const text = buildShareText(241, answers, "Overconfident about geography", 312, "giveortake.game");
    expect(text).toBe(
      "Give or Take #241 🤏\n🎯🎯✅❌✅  312 pts\nOverconfident about geography\ngiveortake.game",
    );
  });

  it("never reveals which questions were hits/misses beyond the emoji row", () => {
    const answers = [answer({ hit: false, points: 0 })];
    const text = buildShareText(1, answers, "Confidently wrong today", 0, "giveortake.game");
    expect(text).not.toContain("q"); // no questionId leakage
    expect(text.split("\n")).toHaveLength(4);
  });

  it("defaults the url to the current page's host when not passed explicitly", () => {
    // In this Node test environment there's no `window`, so the default
    // falls back to an empty string rather than throwing — the real
    // browser call site always has `window.location.host` available.
    const answers = [answer({ hit: true, points: 10 })];
    const text = buildShareText(1, answers, "Sharp today", 10);
    expect(text.endsWith("\n")).toBe(true); // trailing url segment is empty, not undefined/broken
  });
});
