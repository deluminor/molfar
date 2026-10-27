import {
  buildQuestionReply,
  CUSTOM_OPTION_ID,
  type UserQuestion,
  type UserQuestionPrompt,
  type UserQuestionReply,
} from "@/domain/session/user-question";
import { CompanionError } from "./companion-error";

const CUSTOM_TEXT_MAX = 20_000;

export type ApprovalDecision = "allow" | "deny";

export function approvalDecision(value: unknown): ApprovalDecision {
  if (value === "allow" || value === "deny") return value;
  throw new CompanionError('decision must be "allow" or "deny"');
}

function fields(value: unknown, name: string): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CompanionError(`${name} must be an object`);
  return Object.entries(value);
}

function questionFor(questions: readonly UserQuestion[], id: string, name: string): UserQuestion {
  const question = questions.find((entry) => entry.id === id);
  if (!question) throw new CompanionError(`${name} names an unknown question`);
  return question;
}

function selections(value: unknown, questions: readonly UserQuestion[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [id, selected] of fields(value ?? {}, "reply.answers")) {
    const question = questionFor(questions, id, "reply.answers");
    const known = (option: unknown) =>
      option === CUSTOM_OPTION_ID || question.options.some((entry) => entry.id === option);
    if (!Array.isArray(selected) || !selected.every(known))
      throw new CompanionError("reply.answers must list option ids of the question");
    result[id] = selected;
  }

  return result;
}

function customTexts(value: unknown, questions: readonly UserQuestion[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [id, text] of fields(value ?? {}, "reply.custom")) {
    questionFor(questions, id, "reply.custom");
    if (typeof text !== "string" || text.length > CUSTOM_TEXT_MAX)
      throw new CompanionError(`reply.custom must be text up to ${CUSTOM_TEXT_MAX} characters`);
    result[id] = text;
  }

  return result;
}

/** A phone's reply, checked against the pending prompt and normalized like the desktop's own. */
export function questionReply(value: unknown, prompt: UserQuestionPrompt): UserQuestionReply {
  const reply = Object.fromEntries(fields(value, "reply"));
  if (reply.kind === "skipped") return { kind: "skipped" };
  if (reply.kind !== "answered") throw new CompanionError('reply.kind must be "answered" or "skipped"');

  const answers = selections(reply.answers, prompt.questions);
  const custom = customTexts(reply.custom, prompt.questions);
  const normalized = buildQuestionReply(prompt.questions, answers, custom);
  if (normalized.kind === "skipped") throw new CompanionError("reply does not answer any question");

  return normalized;
}
