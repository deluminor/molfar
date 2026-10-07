import { familiarLook, type Familiar } from "../../familiars/model/familiar";
import type { Session } from "../../sessions/model/session";

/** Something waiting on the user that a paired phone should hear about. */
export type CompanionAlert = {
  /** Stable per approval or question, so each one alerts once. */
  key: string;
  title: string;
  body: string;
  target: { kind: "familiar" | "session"; id: string };
};

function line(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Pending approvals and clarifying questions across Familiars and project
 * sessions. Habit runs and orchestration workers relay theirs through a
 * Familiar's chat or their lead, so they are skipped here.
 */
export function companionAlerts(
  sessions: readonly Session[],
  familiars: readonly Familiar[],
): CompanionAlert[] {
  const byConversation = new Map(
    familiars.flatMap((familiar) =>
      familiar.sessionId ? [[familiar.sessionId, familiar] as const] : [],
    ),
  );
  const alerts: CompanionAlert[] = [];
  for (const session of sessions) {
    if (
      session.ephemeral ||
      session.orchestrationLeadId ||
      session.inboxAsk ||
      session.worktreeRemoved
    )
      continue;
    const familiar = byConversation.get(session.id);
    const who = familiar ? familiarLook(familiar).name : session.title || "A session";
    const target = familiar
      ? { kind: "familiar" as const, id: familiar.id }
      : { kind: "session" as const, id: session.id };
    for (const block of session.blocks) {
      if (!block.approval || block.approval.decided) continue;
      alerts.push({
        key: `${session.id}:approval:${block.approval.requestId}`,
        title: familiar ? `${who} needs you` : `Approval: ${line(who, 60)}`,
        body: block.tool?.title
          ? `Approve ${line(block.tool.title)}`
          : "An action is waiting for your approval",
        target,
      });
    }
    const question = session.pendingQuestion;
    if (question) {
      alerts.push({
        key: `${session.id}:question:${question.requestId}`,
        title: familiar ? `${who} has a question` : `Question: ${line(who, 60)}`,
        body: line(question.title || question.questions[0]?.prompt || "Answer to continue"),
        target,
      });
    }
  }
  return alerts;
}
