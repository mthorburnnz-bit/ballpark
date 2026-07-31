import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Question } from "../src/game/types.ts";

// Node/CLI-side mirror of src/game/bank.ts. That module leans on Vite's
// import.meta.glob, which only exists inside a Vite bundle — the content
// linter runs standalone under tsx/Node, so it reads the same JSON files
// from disk instead. Keep the on-disk shape identical between the two.

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, "..", "content");

export interface ScheduleFile {
  launchDate: string;
  schedule: Record<string, string[]>;
}

export function loadQuestionBank(): Question[] {
  const questionsDir = join(contentDir, "questions");
  const files = readdirSync(questionsDir).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(readFileSync(join(questionsDir, f), "utf-8")) as Question);
}

export function loadSchedule(): ScheduleFile {
  return JSON.parse(readFileSync(join(contentDir, "schedule.json"), "utf-8")) as ScheduleFile;
}
