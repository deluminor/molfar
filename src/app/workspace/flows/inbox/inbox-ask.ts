import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@/domain/session/session";
import {
  azureDevOpsWorkItemDetails,
  peekAzureDevOpsWorkItemDetails,
} from "@/features/inbox/model/azure-dev-ops";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { gitlabWorkItemDetails, peekGitlabWorkItemDetails } from "@/features/inbox/model/gitlab";
import { inboxAskKey } from "@/features/inbox/model/inbox-ask";
import { inboxTrackerDescription } from "@/features/inbox/model/inbox-context";
import { deleteSession } from "@/features/sessions/data/session-store";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import { newDefaultSession, newSession } from "@/features/sessions/model/session";
import { forgetHarnessSession } from "@/integrations/harness";
import type { InboxDeps } from "./inbox-deps";

export type InboxAskDeps = Pick<InboxDeps, "store" | "sessionsRef" | "setSessions" | "sidebarCwd"> & {
  removingSessionIds: { readonly current: Set<string> };
  stopSessionForRemoval(sessionId: string): Promise<Session | undefined>;
};

/** The item's description as its tracker has it, for the ask chat's context. */
async function askDescription(item: InboxItem): Promise<string | undefined> {
  if (item.provider === "linear" || item.provider === "jira") return inboxTrackerDescription(item);
  if (item.kind !== "issue" && item.kind !== "pr") return undefined;
  if (item.provider === "gitlab") {
    return (
      peekGitlabWorkItemDetails(item.repo, item.kind, item.number) ??
      (await gitlabWorkItemDetails(item.repo, item.kind, item.number))
    ).body;
  }
  if (item.provider === "azuredevops") {
    return (
      peekAzureDevOpsWorkItemDetails(item.repo, item.kind, item.number) ??
      (await azureDevOpsWorkItemDetails(item.repo, item.kind, item.number))
    ).body;
  }
  return undefined;
}

/** Chats that answer questions about an inbox item, one per item. */
export function createInboxAsk(deps: InboxAskDeps) {
  const opening = new Map<string, Promise<string>>();

  const createAskSession = async (item: InboxItem, key: string): Promise<Session> => {
    const candidate = item.projectPath || deps.sidebarCwd();
    const cwd = candidate && candidate !== "~" ? candidate : await invoke<string>("default_cwd");
    const description = await askDescription(item);
    const session = {
      ...newDefaultSession(cwd),
      title: `Ask · ${item.title}`,
      inboxAsk: { key, title: item.title, url: item.url, provider: item.provider, description },
    };
    deps.sessionsRef.current = [...deps.sessionsRef.current, session];
    deps.setSessions(deps.sessionsRef.current);
    return session;
  };

  /** The id of the item's ask chat, created on first ask. */
  const ask = (item: InboxItem): Promise<string> => {
    const key = inboxAskKey(item);
    const pending = opening.get(key);
    if (pending) return pending;

    const next = (async () => {
      const existing = deps.sessionsRef.current.find((entry) => entry.inboxAsk?.key === key);
      return (existing ?? (await createAskSession(item, key))).id;
    })();
    opening.set(key, next);
    void next.then(
      () => opening.delete(key),
      () => opening.delete(key),
    );
    return next;
  };

  /** Throws the item's ask chat away and starts it over under a new id. */
  const restart = async (item: InboxItem): Promise<string> => {
    const { sessionsRef, removingSessionIds } = deps;
    const id = await ask(item);
    const current = sessionsRef.current.find((session) => session.id === id);
    removingSessionIds.current.add(id);
    try {
      await deps.stopSessionForRemoval(id);
      const stopped = sessionsRef.current.find((session) => session.id === id) ?? current;
      if (!stopped) throw new Error(`Inbox ask session ${id} is missing`);
      await Promise.all(sessionChildHarnesses(stopped).map((harness) => forgetHarnessSession(harness, id)));
      const imagePaths = stopped.blocks.flatMap((block) =>
        block.role === "image" && block.image ? [block.image.path] : [],
      );
      await deleteSession(id, imagePaths);

      const fresh = {
        ...newSession(stopped.harness, stopped.cwd, stopped.model, stopped.runtimeMode, stopped.modelSettings),
        title: stopped.title,
        inboxAsk: stopped.inboxAsk,
      };
      const next = sessionsRef.current.map((session) => (session.id === id ? fresh : session));
      sessionsRef.current = next;
      deps.setSessions(next);
      deps.store
        .getState()
        .setInboxAskPortal((portal) => (portal?.sessionId === id ? { ...portal, sessionId: fresh.id } : portal));
      return fresh.id;
    } finally {
      removingSessionIds.current.delete(id);
    }
  };

  return { ask, restart };
}
