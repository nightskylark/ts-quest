import raw from "./course.json";

export type ChoiceStep = {
  id: string;
  type: "choice";
  prompt: string;
  options: string[];
  answer: string;
  xp: number;
  explanation?: string;
  tip?: string;
};

export type FillStep = {
  id: string;
  type: "fill";
  prompt: string;
  placeholder?: string;
  answers: string[];
  xp: number;
  explanation?: string;
  tip?: string;
};

export type OrderStep = {
  id: string;
  type: "order";
  prompt: string;
  tokens: string[];
  solution: string[];
  xp: number;
  explanation?: string;
  tip?: string;
};

export type MatchStep = {
  id: string;
  type: "match";
  prompt: string;
  left: string[];
  right: string[];
  pairs: Array<{ left: string; right: string }>;
  xp: number;
  explanation?: string;
  tip?: string;
};

export type SelectLineStep = {
  id: string;
  type: "select-line";
  prompt: string;
  lines: string[];
  answerLine: number;
  xp: number;
  explanation?: string;
  tip?: string;
};

export type Step = ChoiceStep | FillStep | OrderStep | MatchStep | SelectLineStep;

export type Level = {
  id: string;
  title: string;
  goal: string;
  steps: Step[];
};

export type Unit = {
  id: string;
  title: string;
  description: string;
  accent: string;
  levels: Level[];
};

export type CourseData = {
  meta: {
    title: string;
    subtitle: string;
    locale: string;
    version: string;
    author: string;
  };
  units: Unit[];
};

export const courseData = raw as CourseData;

export const normalizeAnswer = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^`(.+)`$/, "$1")
    .replace(/^"(.+)"$/, "$1")
    .replace(/^'(.+)'$/, "$1");

export const isStepCorrect = (step: Step, answer: unknown): boolean => {
  if (!step) return false;

  switch (step.type) {
    case "choice":
      return typeof answer === "string" && answer === step.answer;
    case "fill": {
      if (typeof answer !== "string") return false;
      const normalized = normalizeAnswer(answer);
      return step.answers.some((option) => normalizeAnswer(option) === normalized);
    }
    case "order": {
      if (!Array.isArray(answer)) return false;
      return step.solution.join(" ") === answer.join(" ");
    }
    case "match": {
      if (!answer || typeof answer !== "object") return false;
      const map = answer as Record<string, string>;
      return step.pairs.every((pair) => map[pair.left] === pair.right);
    }
    case "select-line":
      return typeof answer === "number" && answer === step.answerLine;
    default:
      return false;
  }
};
