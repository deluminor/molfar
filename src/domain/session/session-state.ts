import { titleFromPrompt } from "./title";
import { HARNESS_LABEL } from "../harness/harness";
import type { Block } from "./block";
import type { Session } from "./session";

export function hasPendingApproval(blocks: Block[]): boolean {
  return blocks.some((block) => block.approval && !block.approval.decided);
}

export function sessionNeedsInput(session: Session): boolean {
  return (
    !session.worktreeRemoved &&
    (hasPendingApproval(session.blocks) || session.pendingQuestion != null)
  );
}
/** The single unsent user turn held by a session, when present. */
export function sessionDraftBlock(
  session: Pick<Session, "blocks">,
): Block | undefined {
  return session.blocks.find((block) => block.role === "user" && block.draft);
}
/** Remove one saved draft without disturbing the conversation before it. */
export function removeSessionDraft(
  session: Session,
  draftBlockId: string,
): Session | undefined {
  const draft = session.blocks.find(
    (block) =>
      block.id === draftBlockId && block.role === "user" && block.draft,
  );
  if (!draft) return undefined;
  const blocks = session.blocks.filter((block) => block.id !== draftBlockId);
  const draftTitle = titleFromPrompt(
    draft.text,
    session.harness,
    draft.attachments,
  );
  return {
    ...session,
    blocks,
    title:
      blocks.length === 0 && session.title === draftTitle
        ? HARNESS_LABEL[session.harness]
        : session.title,
  };
}
/** Working copy the agent and session git UIs should use. */
export function sessionWorkCwd(session: {
  cwd: string;
  worktreeCwd?: string;
}): string {
  return session.worktreeCwd || session.cwd;
}
