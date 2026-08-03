import { describe, it, expect } from "vitest";
import { buildShareText, buildProfileShareText } from "./share.ts";
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
  it("matches the spec §6 format: one emoji per question, points, verdict — text and url kept separate", () => {
    const answers = [
      answer({ tight: true, hit: true }),
      answer({ tight: true, hit: true }),
      answer({ hit: true, tight: false }),
      answer({ hit: false, tight: false, points: 0 }),
      answer({ hit: true, tight: false }),
    ];
    const content = buildShareText(241, answers, "Overconfident about geography", 312, null, "giveortake.game");
    expect(content.text).toBe(
      "Give or Take #241 🤏\n🎯🎯✅❌✅  312 pts\nOverconfident about geography\nThink you can beat me?",
    );
    expect(content.url).toBe("giveortake.game");
  });

  it("never reveals which questions were hits/misses beyond the emoji row", () => {
    const answers = [answer({ hit: false, points: 0 })];
    const content = buildShareText(1, answers, "Confidently wrong today", 0, null, "giveortake.game");
    expect(content.text).not.toContain("q"); // no questionId leakage
    expect(content.text.split("\n")).toHaveLength(4);
  });

  it("defaults the url to the current page's origin when not passed explicitly", () => {
    // In this Node test environment there's no `window`, so the default
    // falls back to an empty string rather than throwing — the real
    // browser call site always has `window.location.origin` available.
    const answers = [answer({ hit: true, points: 10 })];
    const content = buildShareText(1, answers, "Sharp today", 10);
    expect(content.url).toBe("");
  });

  it("adds a percentile line when one is given", () => {
    const answers = [answer({ hit: true, points: 10 })];
    const content = buildShareText(1, answers, "Sharp today", 10, 71, "giveortake.game");
    expect(content.text).toBe("Give or Take #1 🤏\n✅  10 pts — beat 71% of players\nSharp today\nThink you can beat me?");
  });

  it("omits the percentile fragment when null (the closing challenge line stays either way)", () => {
    const answers = [answer({ hit: true, points: 10 })];
    const content = buildShareText(1, answers, "Sharp today", 10, null, "giveortake.game");
    expect(content.text).not.toContain("% of players");
    expect(content.text).toContain("Think you can beat me?");
  });
});

describe("buildProfileShareText", () => {
  it("names the best and worst category with their hit rates", () => {
    const content = buildProfileShareText(
      { best: { category: "history", hitRate: 0.78 }, worst: { category: "money", hitRate: 0.22 } },
      "giveortake.game",
    );
    expect(content.text).toBe("Give or Take 🤏\nSharp on History (78%), hopeless on Money (22%)\nWhat's your profile?");
    expect(content.url).toBe("giveortake.game");
  });
});
