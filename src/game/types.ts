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
