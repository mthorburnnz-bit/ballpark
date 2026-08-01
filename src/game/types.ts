export type Scale = "linear" | "log";

export type Category =
  | "geography"
  | "history"
  | "science"
  | "sport"
  | "everyday"
  | "money"
  | "nature";

export interface Question {
  id: string;
  prompt: string;
  value: number;
  unit: string;
  displayUnit?: string;
  scale: Scale;
  domainMin: number;
  domainMax: number;
  step: number;
  category: Category;
  funFact: string;
  source: string;
  asOf?: string;
}

/**
 * What the client is allowed to know before a question is answered. The
 * true value, fun fact, and source are withheld until the server's
 * /api/reveal responds — unlike the original spec's client-side AES
 * obfuscation, the answer key genuinely never reaches the browser early.
 */
export type PublicQuestion = Omit<Question, "value" | "funFact" | "source">;

export interface QuestionAnswer {
  questionId: string;
  lo: number;
  hi: number;
}

export interface QuestionResult {
  question: Question;
  lo: number;
  hi: number;
  hit: boolean;
  f: number;
  tight: boolean;
  points: number;
}
