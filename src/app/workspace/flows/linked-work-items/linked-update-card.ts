import type { Session } from "@/domain/session/session";
import type { LinkedWorkItemUpdateCard } from "@/domain/work-items/linked-activity";
import { githubWorkItemThread } from "@/features/inbox/model/github-tasks";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import {
  completeLinkedWorkItemUpdateCard,
  failLinkedWorkItemUpdateCard,
  pendingLinkedWorkItemUpdateCard,
} from "@/features/inbox/model/linked-work-item-activity";
import type { InboxDeps } from "../inbox/inbox-deps";

export type LinkedUpdateCardDeps = Pick<InboxDeps, "sessionsRef" | "setSessions"> & {
  /** The latest activity of each linked chat's work item, by session id. */
  linkedUpdates(): ReadonlyMap<string, LinkedSessionUpdate>;
};

type CardUpdate = (card: LinkedWorkItemUpdateCard | undefined) => LinkedWorkItemUpdateCard | undefined;

/** The card a linked chat shows when its work item got new activity. */
export function createLinkedUpdateCards(deps: LinkedUpdateCardDeps) {
  const fetches = new Map<string, number>();

  const update = (sessionId: string, change: CardUpdate): void => {
    const previous = deps.sessionsRef.current;
    const next = previous.map((session) => {
      if (session.id !== sessionId) return session;
      const card = change(session.linkedWorkItemUpdateCard);
      return card === session.linkedWorkItemUpdateCard
        ? session
        : { ...session, linkedWorkItemUpdateCard: card };
    });
    if (!next.some((session, index) => session !== previous[index])) return;
    deps.sessionsRef.current = next;
    deps.setSessions(next);
  };

  const shouldReveal = (session: Session | undefined, sessionId: string, change: LinkedSessionUpdate) =>
    !!session?.linkedWorkItem &&
    !(
      session.linkedWorkItemUpdateCard?.updatedAt === change.updatedAt &&
      session.linkedWorkItemUpdateCard.status !== "error"
    ) &&
    fetches.get(sessionId) !== change.updatedAt;

  /** Shows the update on the chat's card, loading the work item's latest thread. */
  const reveal = (sessionId: string, change: LinkedSessionUpdate): void => {
    const session = deps.sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session?.linkedWorkItem || !shouldReveal(session, sessionId, change)) return;

    const pending = pendingLinkedWorkItemUpdateCard(change);
    fetches.set(sessionId, change.updatedAt);
    // A stale/error card should not remain visible while fresh details load.
    // The session itself is already open; this request stays fully detached
    // from the navigation path.
    update(sessionId, (current) =>
      current?.updatedAt === change.updatedAt && current.status === "ready" ? current : undefined,
    );

    const settle = (card: () => LinkedWorkItemUpdateCard) => {
      if (fetches.get(sessionId) !== pending.updatedAt) return;
      fetches.delete(sessionId);
      if (deps.linkedUpdates().get(sessionId)?.updatedAt !== pending.updatedAt) return;
      update(sessionId, card);
    };
    const { linkedWorkItem } = session;
    void githubWorkItemThread(
      session.cwd,
      linkedWorkItem.repo,
      linkedWorkItem.kind,
      linkedWorkItem.number,
      { force: true },
    ).then(
      (thread) => settle(() => completeLinkedWorkItemUpdateCard(pending, thread)),
      () => settle(() => failLinkedWorkItemUpdateCard(pending)),
    );
  };

  return { update, reveal, dismiss: (sessionId: string) => update(sessionId, () => undefined) };
}
