import { HARNESS_LABEL } from "@/domain/harness/harness";
import type { Attachment } from "@/domain/session/attachment";
import { removeSessionDraft, sessionDraftBlock } from "@/domain/session/session-state";
import { canReplaceSessionTitle, titleFromPrompt } from "@/domain/session/title";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { discardDraftSessionRecord, shouldPersistSession } from "@/features/sessions/data/session-store";
import type { ComposerDeps } from "./composer-deps";

/** Keeps an unsent message as the session's draft turn. False when it cannot take one. */
export function saveDraft(
  deps: ComposerDeps,
  sessionId: string,
  text: string,
  attachments: Attachment[] = [],
  appRequestId?: string,
): boolean {
  const current = deps.sessionsRef.current.find((session) => session.id === sessionId);
  if (current && remoteProjectFor(current.cwd))
    return !!remoteSessionActions(sessionId)?.saveDraft(text, attachments);
  if (
    !current ||
    current.busy ||
    sessionDraftBlock(current) ||
    current.inboxAsk ||
    current.worktreeRemoved ||
    (!text.trim() && attachments.length === 0)
  ) {
    return false;
  }

  const placeholderTitle = canReplaceSessionTitle(current.title, current.harness, HARNESS_LABEL[current.harness]);
  const title = placeholderTitle ? titleFromPrompt(text, current.harness, attachments) : current.title;
  deps.setSessions((prev) =>
    prev.map((session) =>
      session.id === sessionId && !sessionDraftBlock(session)
        ? {
            ...session,
            title,
            blocks: [
              ...session.blocks,
              {
                id: crypto.randomUUID(),
                role: "user",
                text,
                ...(attachments.length > 0 ? { attachments } : {}),
                draft: true,
                ...(appRequestId ? { appRequestId } : {}),
              },
            ],
          }
        : session,
    ),
  );
  return true;
}

/** Drops a draft turn; a session that was only that draft is forgotten entirely. */
export function removeDraft(deps: ComposerDeps, sessionId: string, draftBlockId: string): boolean {
  const current = deps.sessionsRef.current.find((session) => session.id === sessionId);
  if (!current) return false;
  const withoutDraft = removeSessionDraft(current, draftBlockId);
  if (!withoutDraft) return false;

  if (!shouldPersistSession(withoutDraft)) {
    const { setHistory, setStoredLinkedSessions } = deps.store.getState();
    deps.persistence.dropPending(sessionId);
    deps.persistence.forgetSaved(sessionId);
    deps.persistence.forgetUserTurn(sessionId);
    deps.invalidateLoadedSession(sessionId);
    setHistory((history) => history.filter((session) => session.id !== sessionId));
    setStoredLinkedSessions((history) => history.filter((session) => session.id !== sessionId));
    void discardDraftSessionRecord(sessionId).catch(() => undefined);
  }

  deps.setSessions((sessions) =>
    sessions.map((session) =>
      session.id === sessionId ? (removeSessionDraft(session, draftBlockId) ?? session) : session,
    ),
  );
  return true;
}
