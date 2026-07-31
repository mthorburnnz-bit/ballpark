import { loadQuestionBank, loadSchedule } from "./loadContent.ts";
import { validateBank, validateSchedule } from "../src/game/contentRules.ts";
import { questionsForDate, todayLocalDateString } from "../src/game/daily.ts";

/** Blocking CI content linter — spec §7.4. Exits non-zero on any violation. */

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function main(): void {
  const bank = loadQuestionBank();
  const { schedule } = loadSchedule();
  const questionsById = new Map(bank.map((q) => [q.id, q]));

  const issues = [...validateBank(bank), ...validateSchedule(schedule, questionsById)];

  // Every date in the next 60 days must resolve to five valid, distinct
  // questions, via explicit schedule.json entry or the seeded-random fallback.
  const today = todayLocalDateString();
  for (let i = 0; i < 60; i++) {
    const dateStr = addDays(today, i);
    const qs = questionsForDate(dateStr, schedule, bank, questionsById);
    const distinctCount = new Set(qs.map((q) => q.id)).size;
    if (qs.length !== 5 || distinctCount !== 5) {
      issues.push({
        message: `${dateStr}: does not resolve to 5 distinct questions (got ${qs.length}, ${distinctCount} distinct)`,
      });
    }
  }

  if (issues.length > 0) {
    console.error(`Content validation FAILED with ${issues.length} issue(s):\n`);
    for (const issue of issues) {
      console.error(`  ${issue.questionId ? `[${issue.questionId}] ` : ""}${issue.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Content validation passed: ${bank.length} questions, ${Object.keys(schedule).length} scheduled days, next 60 days all resolve.`,
  );
}

main();
