import { describe, it, expect } from "vitest";
import { validateQuestion, validateBank, validateScheduleEntry, validateSchedule } from "./contentRules.ts";
import type { Question } from "./types.ts";

function goodQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "test-question",
    prompt: "What is the test value?",
    value: 50,
    unit: "km",
    scale: "linear",
    domainMin: 0,
    domainMax: 100,
    step: 1,
    category: "geography",
    funFact: "A fact that isn't just the number again.",
    source: "https://example.com/source",
    ...overrides,
  };
}

describe("validateQuestion", () => {
  it("passes a well-formed question", () => {
    expect(validateQuestion(goodQuestion())).toEqual([]);
  });

  it("flags a value outside the domain", () => {
    const issues = validateQuestion(goodQuestion({ value: 500 }));
    expect(issues.some((i) => i.message.includes("strictly inside domain"))).toBe(true);
  });

  it("flags a value too close to the domain edge (outside 10-90%)", () => {
    const issues = validateQuestion(goodQuestion({ value: 95 })); // 95% position
    expect(issues.some((i) => i.message.includes("10%-90%"))).toBe(true);
  });

  it("flags log scale with domainMin <= 0", () => {
    const issues = validateQuestion(goodQuestion({ scale: "log", domainMin: 0, domainMax: 1000, value: 100 }));
    expect(issues.some((i) => i.message.includes("domainMin > 0"))).toBe(true);
  });

  it("flags a step too coarse for the domain", () => {
    const issues = validateQuestion(goodQuestion({ step: 60 })); // 2*60=120 >= domain width 100
    expect(issues.some((i) => i.message.includes("too coarse"))).toBe(true);
  });

  it("requires asOf for money-category questions", () => {
    const issues = validateQuestion(goodQuestion({ category: "money", unit: "$" }));
    expect(issues.some((i) => i.message.includes('requires "asOf"'))).toBe(true);
  });

  it("accepts a money question with asOf pinned in the prompt", () => {
    const issues = validateQuestion(
      goodQuestion({
        category: "money",
        unit: "$",
        asOf: "2024",
        prompt: "What was the price in 2024, in dollars?",
      }),
    );
    expect(issues).toEqual([]);
  });

  it("flags a non-URL source", () => {
    const issues = validateQuestion(goodQuestion({ source: "not-a-url" }));
    expect(issues.some((i) => i.message.includes("must be a URL"))).toBe(true);
  });
});

describe("validateBank", () => {
  it("flags duplicate ids", () => {
    const bank = [goodQuestion({ id: "dup" }), goodQuestion({ id: "dup", prompt: "Different prompt entirely?" })];
    const issues = validateBank(bank);
    expect(issues.some((i) => i.message.includes("used 2 times"))).toBe(true);
  });

  it("flags near-duplicate prompts", () => {
    const bank = [
      goodQuestion({ id: "a", prompt: "How far is it, in km?" }),
      goodQuestion({ id: "b", prompt: "how far is it in km" }),
    ];
    const issues = validateBank(bank);
    expect(issues.some((i) => i.message.includes("near-duplicate"))).toBe(true);
  });

  describe("default-window distribution", () => {
    // value=50 in domain [0,100] sits at exactly 50% — inside the slider's
    // default 35%-65% starting range.
    function bankOfSize(n: number, fraction: "default" | "spread"): Question[] {
      return Array.from({ length: n }, (_, i) =>
        goodQuestion({
          id: `q${i}`,
          prompt: `Distinct prompt number ${i} entirely?`,
          value: fraction === "default" ? 50 : i % 2 === 0 ? 20 : 80,
        }),
      );
    }

    it("ignores small banks, even at 100% clustering", () => {
      const issues = validateBank(bankOfSize(19, "default"));
      expect(issues.some((i) => i.message.includes("default"))).toBe(false);
    });

    it("flags a large bank clustered in the default window", () => {
      const issues = validateBank(bankOfSize(20, "default"));
      expect(issues.some((i) => i.message.includes("above the 40% cap"))).toBe(true);
    });

    it("passes a large bank spread outside the default window", () => {
      const issues = validateBank(bankOfSize(20, "spread"));
      expect(issues.some((i) => i.message.includes("above the 40% cap"))).toBe(false);
    });
  });
});

describe("validateScheduleEntry", () => {
  const bank = new Map<string, Question>([
    ["a", goodQuestion({ id: "a", category: "geography", scale: "log", domainMin: 1, domainMax: 1000, value: 50 })],
    ["b", goodQuestion({ id: "b", category: "geography" })],
    ["c", goodQuestion({ id: "c", category: "geography" })],
    ["d", goodQuestion({ id: "d", category: "history" })],
    ["e", goodQuestion({ id: "e", category: "sport" })],
  ]);

  it("flags more than 2 questions from one category", () => {
    const issues = validateScheduleEntry(["a", "b", "c", "d", "e"], bank, "2026-01-01");
    expect(issues.some((i) => i.message.includes('category "geography" appears 3 times'))).toBe(true);
  });

  it("flags a day with no scale mix", () => {
    const allLinear = new Map<string, Question>([
      ["x", goodQuestion({ id: "x", category: "geography" })],
      ["y", goodQuestion({ id: "y", category: "history" })],
      ["z", goodQuestion({ id: "z", category: "sport" })],
      ["w", goodQuestion({ id: "w", category: "science" })],
      ["v", goodQuestion({ id: "v", category: "nature" })],
    ]);
    const issues = validateScheduleEntry(["x", "y", "z", "w", "v"], allLinear, "2026-01-01");
    expect(issues.some((i) => i.message.includes("mix at least one log"))).toBe(true);
  });

  it("passes a well-formed day (max 2 per category, both scales present)", () => {
    const cleanBank = new Map<string, Question>([
      ["a", goodQuestion({ id: "a", category: "geography", scale: "log", domainMin: 1, domainMax: 1000, value: 50 })],
      ["b", goodQuestion({ id: "b", category: "geography" })],
      ["d", goodQuestion({ id: "d", category: "history" })],
      ["e", goodQuestion({ id: "e", category: "sport" })],
      ["f", goodQuestion({ id: "f", category: "science" })],
    ]);
    const issues = validateScheduleEntry(["a", "b", "d", "e", "f"], cleanBank, "2026-01-01");
    expect(issues).toEqual([]);
  });
});

describe("validateSchedule", () => {
  const bank = new Map<string, Question>([
    ["a", goodQuestion({ id: "a", category: "geography", scale: "log", domainMin: 1, domainMax: 1000, value: 50 })],
    ["b", goodQuestion({ id: "b", category: "history" })],
    ["c", goodQuestion({ id: "c", category: "sport" })],
    ["d", goodQuestion({ id: "d", category: "science" })],
    ["e", goodQuestion({ id: "e", category: "nature" })],
    ["f", goodQuestion({ id: "f", category: "everyday" })],
  ]);

  it("flags a question reused across two different days", () => {
    const schedule = {
      "2026-01-01": ["a", "b", "c", "d", "e"],
      "2026-01-02": ["a", "f", "b", "c", "d"],
    };
    const issues = validateSchedule(schedule, bank);
    expect(issues.some((i) => i.questionId === "a" && i.message.includes("used on both"))).toBe(true);
  });
});
