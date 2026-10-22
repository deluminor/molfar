import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { InboxDeps } from "./inbox-deps";

export const issue: InboxItem = {
  kind: "issue",
  number: 42,
  title: "Login fails",
  url: "https://github.com/acme/app/issues/42",
  state: "open",
  updatedAt: "2026-10-01T00:00:00Z",
  labels: [],
  assignees: [],
  draft: false,
  repo: "acme/app",
  projectPath: "/work/demo",
  provider: "github",
};

/** Inbox deps over a store in `/work/demo`, with the given open sessions. */
export function setupInbox(sessions: Session[] = [{ ...testSession("claude", "/work/demo"), id: "s" }]) {
  const store = createWorkspaceStore(
    testWorkspaceState({ sessions, projectCwd: "/work/demo", inboxViewOpen: true }),
  );
  const sessionsRef = { current: sessions };
  const opened: Array<{ session: Session; cwd: string }> = [];
  const deps = {
    store,
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    closeAutomations: vi.fn(),
    setSidebarTab: vi.fn(),
    openSessionTab: (session, cwd) => {
      opened.push({ session, cwd });
      return newTab(session.id);
    },
    selectTab: vi.fn(),
    focusComposer: vi.fn(),
    defaultCwd: () => "/work/demo",
    runtimeMode: () => undefined,
    sidebarCwd: () => "/work/demo",
    selectHistorySession: vi.fn(async () => undefined),
    ensureOpenSession: vi.fn(async (id: string) => sessionsRef.current.find((s) => s.id === id)),
    submit: vi.fn(() => true),
  } satisfies InboxDeps;

  return { deps, store, opened, sessions: () => sessionsRef.current };
}
