import type { MobileCommandDeps } from "./mobile-command-types";
import type { Session } from "@/domain/session/session";
import { mobileQuestionReply } from "@/features/mobile/model/mobile-question";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";

export function answerMobileQuestion(
  deps: Pick<MobileCommandDeps, "sessionsRef" | "answer" | "keepQuestionOpen">,
  session: Session,
  method: string,
  params: Record<string, unknown>,
): { sessionId: string } {
  const live = deps.sessionsRef.current.find(
    (current) => current.id === session.id,
  );
  if (!live || live.worktreeRemoved)
    throw new Error("Session is no longer available");

  const question = live.pendingQuestion;
  if (!question || question.requestId !== params.requestId)
    throw new Error("This question was already answered");
  if (method === "session.keepQuestionOpen") {
    deps.keepQuestionOpen(live.id, question.requestId);
    return { sessionId: live.id };
  }
  if (remoteProjectFor(live.cwd) && !remoteSessionActions(live.id))
    throw new Error("Open this session on the desktop to answer it");

  const reply = mobileQuestionReply(params.reply, question);
  if (!reply) throw new Error("Choose an answer or skip the question");
  deps.answer(live.id, question.requestId, reply);
  return { sessionId: live.id };
}
