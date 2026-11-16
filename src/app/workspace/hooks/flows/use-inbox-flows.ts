import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import { type BtwDeps, createBtw } from "../../flows/btw/btw-actions";
import { createInboxActions } from "../../flows/inbox/inbox-actions";
import { createLinkedUpdateCards } from "../../flows/linked-work-items/linked-update-card";
import { createLinkedWorkItemPanels } from "../../flows/linked-work-items/linked-work-item-panel";
import type { AddToChatDeps } from "../use-add-to-chat";
import { useStableFlow } from "../use-stable-flow";

export type InboxFlowsInput = AddToChatDeps & {
  /** Read lazily: session persistence is built later in the render. */
  persist: BtwDeps["persist"];
};

export function createInboxFlows({ persist, tabsRef, activeTabIdRef, projectCwdRef, ...inboxDeps }: InboxFlowsInput) {
  const { sessionsRef, setSessions } = inboxDeps;
  const btw = createBtw({
    openSessions: () => sessionsRef.current,
    commitSessions: (next) => {
      sessionsRef.current = next;
      setSessions(next);
    },
    persist,
  });
  const linkedUpdatesRef: { current: ReadonlyMap<string, LinkedSessionUpdate> } = { current: new Map() };

  return {
    btw,
    linkedPanels: createLinkedWorkItemPanels(inboxDeps),
    addToChatDeps: { ...inboxDeps, tabsRef, activeTabIdRef, projectCwdRef },
    linkedUpdatesRef,
    linkedUpdateCards: createLinkedUpdateCards({
      sessionsRef,
      setSessions,
      linkedUpdates: () => linkedUpdatesRef.current,
    }),
    inboxActions: createInboxActions(inboxDeps),
  };
}

/** Side questions, inbox / note actions, linked work item panels and update cards, and the add-to-chat deps; built once. */
export function useInboxFlows(input: InboxFlowsInput): ReturnType<typeof createInboxFlows> {
  return useStableFlow(() => createInboxFlows(input));
}
