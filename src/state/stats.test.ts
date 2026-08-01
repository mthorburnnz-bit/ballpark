import { describe, it, expect } from "vitest";
import { recordDayCompletion, deriveStats } from "./stats.ts";
import { defaultSave } from "./save.ts";
import type { SaveData, DayProgress, AnswerRecord } from "./save.ts";

function answer(overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    questionId: "q",
    lo: 0,
    hi: 10,
    hit: true,
    f: 0.2,
    tight: false,
    points: 60,
    category: "geography",
    trueValue: 5,
    ...overrides,
  };
}

function completedDay(date: string, answers: AnswerRecord[]): DayProgress {
  return {
    date,
    questionIds: answers.map((a) => a.questionId),
    answers,
    currentIndex: answers.length,
    state: "complete",
  };
}

describe("recordDayCompletion — streak logic", () => {
  it("starts a fresh streak at 1 on first-ever completion", () => {
    const save = defaultSave();
    save.days["2026-07-27"] = completedDay("2026-07-27", [answer()]);
    recordDayCompletion(save, "2026-07-27");
    expect(save.streak.current).toBe(1);
    expect(save.streak.best).toBe(1);
    expect(save.streak.lastCompletedDate).toBe("2026-07-27");
  });

  it("continues the streak when the previous local day was completed", () => {
    const save = defaultSave();
    save.streak = { current: 4, best: 4, lastCompletedDate: "2026-07-26" };
    save.days["2026-07-27"] = completedDay("2026-07-27", [answer()]);
    recordDayCompletion(save, "2026-07-27");
    expect(save.streak.current).toBe(5);
    expect(save.streak.best).toBe(5);
  });

  it("resets the streak to 1 after a gap of more than one day", () => {
    const save = defaultSave();
    save.streak = { current: 10, best: 10, lastCompletedDate: "2026-07-20" };
    save.days["2026-07-27"] = completedDay("2026-07-27", [answer()]);
    recordDayCompletion(save, "2026-07-27");
    expect(save.streak.current).toBe(1);
    expect(save.streak.best).toBe(10); // best is a high-water mark, doesn't drop
  });

  it("is idempotent — calling twice for the same day doesn't double-count", () => {
    const save = defaultSave();
    save.days["2026-07-27"] = completedDay("2026-07-27", [answer()]);
    recordDayCompletion(save, "2026-07-27");
    recordDayCompletion(save, "2026-07-27");
    expect(save.streak.current).toBe(1);
    expect(save.lifetime.gamesPlayed).toBe(1);
  });

  it("does nothing for a day that isn't complete", () => {
    const save = defaultSave();
    save.days["2026-07-27"] = { ...completedDay("2026-07-27", [answer()]), state: "inProgress" };
    recordDayCompletion(save, "2026-07-27");
    expect(save.lifetime.gamesPlayed).toBe(0);
  });
});

describe("recordDayCompletion — lifetime + category stats", () => {
  it("aggregates points, hits, tight hits, and per-category hit rate", () => {
    const save = defaultSave();
    const answers = [
      answer({ questionId: "a", category: "geography", hit: true, tight: true, points: 90 }),
      answer({ questionId: "b", category: "geography", hit: false, tight: false, points: 0 }),
      answer({ questionId: "c", category: "history", hit: true, tight: false, points: 40 }),
      answer({ questionId: "d", category: "sport", hit: true, tight: false, points: 55 }),
      answer({ questionId: "e", category: "nature", hit: false, tight: false, points: 0 }),
    ];
    save.days["2026-07-27"] = completedDay("2026-07-27", answers);
    recordDayCompletion(save, "2026-07-27");

    expect(save.lifetime.totalScore).toBe(90 + 40 + 55);
    expect(save.lifetime.totalQuestions).toBe(5);
    expect(save.lifetime.totalHits).toBe(3);
    expect(save.lifetime.totalTight).toBe(1);
    expect(save.lifetime.totalWidthFraction).toBeCloseTo(5 * 0.2); // all 5 answers use the default f=0.2
    expect(save.lifetime.categoryTotals.geography).toEqual({ questions: 2, hits: 1 });
    expect(save.lifetime.categoryTotals.history).toEqual({ questions: 1, hits: 1 });
  });
});

describe("deriveStats", () => {
  it("computes averages and rates across multiple completed days", () => {
    const save: SaveData = defaultSave();
    save.days["2026-07-27"] = completedDay("2026-07-27", [
      answer({ questionId: "a", hit: true, points: 100 }),
      answer({ questionId: "b", hit: false, points: 0 }),
    ]);
    save.days["2026-07-28"] = completedDay("2026-07-28", [
      answer({ questionId: "c", hit: true, points: 50 }),
      answer({ questionId: "d", hit: true, tight: true, points: 90 }),
    ]);
    recordDayCompletion(save, "2026-07-27");
    recordDayCompletion(save, "2026-07-28");

    const stats = deriveStats(save);
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.averageScore).toBe((100 + 0 + 50 + 90) / 2);
    expect(stats.hitRate).toBeCloseTo(3 / 4);
    expect(stats.tightHitRate).toBeCloseTo(1 / 4);
    expect(stats.currentStreak).toBe(2);
  });

  it("returns zeros for a fresh save with no history", () => {
    const stats = deriveStats(defaultSave());
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.averageScore).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.categoryHitRates).toEqual([]);
    expect(stats.confidence).toBeNull();
  });
});

describe("deriveStats — confidence score", () => {
  function playDays(save: SaveData, days: AnswerRecord[][]): void {
    days.forEach((dayAnswers, i) => {
      const date = `2026-08-${String(1 + i).padStart(2, "0")}`;
      save.days[date] = completedDay(date, dayAnswers);
      recordDayCompletion(save, date);
    });
  }

  it("stays null below the minimum sample size", () => {
    const save = defaultSave();
    playDays(save, [[answer(), answer(), answer()]]); // 3 answers, under the 10-sample floor
    expect(deriveStats(save).confidence).toBeNull();
  });

  it("flags overconfident when hit rate trails average range width", () => {
    const save = defaultSave();
    const wide = (hit: boolean) => answer({ f: 0.5, hit });
    playDays(save, [
      [wide(true), wide(true), wide(false), wide(false), wide(false)],
      [wide(false), wide(false), wide(false), wide(false), wide(false)],
    ]); // 10 answers, f=0.5 throughout, 2 hits -> hitRate 0.2

    expect(deriveStats(save).confidence).toEqual({
      label: "overconfident",
      avgWidthPercent: 50,
      hitRatePercent: 20,
      gapPercent: 30,
    });
  });

  it("flags underconfident when hit rate beats average range width", () => {
    const save = defaultSave();
    const narrow = (hit: boolean) => answer({ f: 0.2, hit });
    playDays(save, [
      [narrow(true), narrow(true), narrow(true), narrow(false), narrow(false)],
      [narrow(true), narrow(true), narrow(true), narrow(false), narrow(false)],
    ]); // 10 answers, f=0.2 throughout, 6 hits -> hitRate 0.6

    expect(deriveStats(save).confidence).toEqual({
      label: "underconfident",
      avgWidthPercent: 20,
      hitRatePercent: 60,
      gapPercent: 40,
    });
  });

  it("calls it calibrated when hit rate matches average range width", () => {
    const save = defaultSave();
    const matched = (hit: boolean) => answer({ f: 0.3, hit });
    playDays(save, [
      [matched(true), matched(true), matched(true), matched(false), matched(false)],
      [matched(false), matched(false), matched(false), matched(false), matched(false)],
    ]); // 10 answers, f=0.3 throughout, 3 hits -> hitRate 0.3

    expect(deriveStats(save).confidence).toEqual({
      label: "calibrated",
      avgWidthPercent: 30,
      hitRatePercent: 30,
      gapPercent: 0,
    });
  });
});

describe("deriveStats — streak badges", () => {
  function withBestStreak(best: number): SaveData {
    const save = defaultSave();
    save.streak.best = best;
    return save;
  }

  it("earns no badges with no streak history", () => {
    const badges = deriveStats(withBestStreak(0)).streakBadges;
    expect(badges.map((b) => b.earned)).toEqual([false, false, false]);
  });

  it("does not earn a badge one day short of its threshold", () => {
    const badges = deriveStats(withBestStreak(6)).streakBadges;
    expect(badges.find((b) => b.threshold === 7)?.earned).toBe(false);
  });

  it("earns exactly at the threshold", () => {
    const badges = deriveStats(withBestStreak(7)).streakBadges;
    expect(badges.map((b) => b.earned)).toEqual([true, false, false]);
  });

  it("earns lower badges too once a higher streak is reached", () => {
    const badges = deriveStats(withBestStreak(100)).streakBadges;
    expect(badges.map((b) => b.earned)).toEqual([true, true, true]);
  });

  it("stays earned even after the current streak resets, since it's based on best", () => {
    const save = withBestStreak(30);
    save.streak.current = 0;
    const badges = deriveStats(save).streakBadges;
    expect(badges.find((b) => b.threshold === 30)?.earned).toBe(true);
  });
});
