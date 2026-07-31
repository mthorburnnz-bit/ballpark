import { describe, it, expect } from "vitest";
import {
  todayLocalDateString,
  puzzleNumberForDate,
  fallbackQuestionsForDate,
  questionsForDate,
} from "./daily.ts";
import type { Question, Category } from "./types.ts";

function makeQuestion(id: string, category: Category): Question {
  return {
    id,
    prompt: `Prompt for ${id}?`,
    value: 50,
    unit: "km",
    scale: "linear",
    domainMin: 0,
    domainMax: 100,
    step: 1,
    category,
    funFact: "fact",
    source: "https://example.com",
  };
}

const categories: Category[] = ["geography", "history", "science", "sport", "everyday", "money", "nature"];
// 3 questions per category = 21, plenty for a 5-question pull with a 2-per-category cap.
const fakeBank: Question[] = categories.flatMap((cat) =>
  [0, 1, 2].map((i) => makeQuestion(`${cat}-${i}`, cat)),
);

describe("todayLocalDateString", () => {
  it("formats as YYYY-MM-DD using local date parts", () => {
    const d = new Date(2026, 6, 27); // July is month index 6
    expect(todayLocalDateString(d)).toBe("2026-07-27");
  });
});

describe("puzzleNumberForDate", () => {
  it("launch date is puzzle #1", () => {
    expect(puzzleNumberForDate("2026-07-27", "2026-07-27")).toBe(1);
  });

  it("increments by one per day after launch", () => {
    expect(puzzleNumberForDate("2026-07-28", "2026-07-27")).toBe(2);
    expect(puzzleNumberForDate("2026-08-01", "2026-07-27")).toBe(6);
  });
});

describe("fallbackQuestionsForDate", () => {
  it("always returns exactly 5 distinct questions", () => {
    const result = fallbackQuestionsForDate("2026-09-15", fakeBank);
    expect(result).toHaveLength(5);
    expect(new Set(result.map((q) => q.id)).size).toBe(5);
  });

  it("is deterministic for a given date", () => {
    const a = fallbackQuestionsForDate("2026-09-15", fakeBank);
    const b = fallbackQuestionsForDate("2026-09-15", fakeBank);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("differs across dates (not a constant selection)", () => {
    const a = fallbackQuestionsForDate("2026-09-15", fakeBank);
    const b = fallbackQuestionsForDate("2026-09-16", fakeBank);
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });

  it("respects the max-two-per-category cap when the bank allows it", () => {
    const result = fallbackQuestionsForDate("2026-09-15", fakeBank);
    const counts = new Map<Category, number>();
    for (const q of result) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});

describe("questionsForDate", () => {
  const schedule = { "2026-07-27": ["geography-0", "history-0", "science-0", "sport-0", "everyday-0"] };
  const questionsById = new Map(fakeBank.map((q) => [q.id, q]));

  it("uses the explicit schedule entry when present", () => {
    const result = questionsForDate("2026-07-27", schedule, fakeBank, questionsById);
    expect(result.map((q) => q.id)).toEqual([
      "geography-0",
      "history-0",
      "science-0",
      "sport-0",
      "everyday-0",
    ]);
  });

  it("falls back to the seeded picker for an unscheduled date", () => {
    const result = questionsForDate("2099-01-01", schedule, fakeBank, questionsById);
    expect(result).toHaveLength(5);
  });

  it("falls back if a scheduled id doesn't exist in the bank (never breaks)", () => {
    const brokenSchedule = { "2026-07-27": ["geography-0", "missing-id", "science-0", "sport-0", "everyday-0"] };
    const result = questionsForDate("2026-07-27", brokenSchedule, fakeBank, questionsById);
    expect(result).toHaveLength(5);
    expect(result.every((q) => fakeBank.includes(q))).toBe(true);
  });
});
