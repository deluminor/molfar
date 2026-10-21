import {
  DEFAULT_PROVIDER_ACCOUNT_ID,
  type ProviderAccountProvider,
} from "@/domain/harness/provider-account";
import type { Session } from "@/domain/session/session";
import { newSession } from "@/features/sessions/model/session";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";

export type ProviderAccountDeps = {
  sessions(): Session[];
  updateSessions(update: (sessions: Session[]) => Session[]): void;
  /** A limited session continues in place under the selected account. */
  continueLimited(sessionId: string, accountId: string): void;
  appendTab(tab: WorkspaceTab, cwd: string): void;
  setActiveTabId(tabId: string): void;
  setComposerFocused(focused: boolean): void;
};

/** Switches the active session's provider account, or opens a clean session for it. */
export function selectProviderAccount(
  deps: ProviderAccountDeps,
  activeSessionId: string | undefined,
  provider: ProviderAccountProvider,
  accountId: string,
): void {
  const current = deps.sessions().find((session) => session.id === activeSessionId);
  if (!current || current.harness !== provider) return;

  if (current.usageLimit && !current.busy) {
    deps.continueLimited(current.id, accountId);
    return;
  }

  if (current.blocks.length === 0 && !current.busy) {
    if (current.providerAccountId === accountId) return;
    deps.updateSessions((sessions) =>
      sessions.map((session) =>
        session.id === current.id ? { ...session, providerAccountId: accountId } : session,
      ),
    );
    return;
  }

  if ((current.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID) === accountId) return;

  // Provider thread ids are account-owned. Keep the current conversation
  // pinned to its account and open a clean one for the selected profile.
  const session = {
    ...newSession(current.harness, current.cwd, current.model, current.runtimeMode, current.modelSettings),
    providerAccountId: accountId,
  };
  const tab = newTab(session.id);
  deps.updateSessions((sessions) => [...sessions, session]);
  deps.appendTab(tab, current.cwd);
  deps.setActiveTabId(tab.id);
  deps.setComposerFocused(true);
}
