import { asRecord } from "@/shared/lib/json-text";
import {
  CUSTOM_OPTION_ID,
  buildQuestionReply,
  type UserQuestionPrompt,
  type UserQuestionReply,
} from "@/domain/session/user-question";

export function mobileQuestionReply(
  value: unknown,
  prompt: UserQuestionPrompt,
): UserQuestionReply | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const reply = asRecord(value);
  if (!reply) return;
  if (reply.kind === "skipped") return { kind: "skipped" };
  if (reply.kind !== "answered") return;
  const answers: Record<string, string[]> = {};
  const custom: Record<string, string> = {};
  for (const question of prompt.questions) {
    const selected = asRecord(reply.answers)?.[question.id];
    if (Array.isArray(selected))
      answers[question.id] = selected.filter(
        (id): id is string =>
          (id === CUSTOM_OPTION_ID && question.allowCustom) ||
          question.options.some((option) => option.id === id),
      );
    const text = asRecord(reply.custom)?.[question.id];
    if (typeof text === "string" && text.length <= 10_000)
      custom[question.id] = text;
  }
  const rebuilt = buildQuestionReply(prompt.questions, answers, custom);
  return rebuilt.kind === "answered" ? rebuilt : undefined;
}
