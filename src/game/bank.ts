import type { Question } from "./types.ts";
import scheduleData from "../../content/schedule.json";
import { questionsForDate as pureQuestionsForDate, puzzleNumberForDate as purePuzzleNumberForDate } from "./daily.ts";

interface ScheduleFile {
  launchDate: string;
  schedule: Record<string, string[]>;
}

// import.meta.glob is a Vite build-time macro — this module only works when
// bundled by Vite (the browser app). The content linter (tools/) loads the
// same files via Node's fs instead; see tools/loadContent.ts.
const questionModules = import.meta.glob("/content/questions/*.json", { eager: true }) as Record<
  string,
  { default: Question }
>;

export const questionBank: Question[] = Object.values(questionModules).map((m) => m.default);

export const questionsById: Map<string, Question> = new Map(questionBank.map((q) => [q.id, q]));

const scheduleFile = scheduleData as ScheduleFile;

export const schedule: Record<string, string[]> = scheduleFile.schedule;

export const launchDate: string = scheduleFile.launchDate;

export function getQuestion(id: string): Question {
  const q = questionsById.get(id);
  if (!q) throw new Error(`Unknown question id: ${id}`);
  return q;
}

/** Bound convenience wrapper over the pure daily.ts resolver, using this app's loaded bank. */
export function questionsForDate(dateStr: string): Question[] {
  return pureQuestionsForDate(dateStr, schedule, questionBank, questionsById);
}

export function puzzleNumberForDate(dateStr: string): number {
  return purePuzzleNumberForDate(dateStr, launchDate);
}
