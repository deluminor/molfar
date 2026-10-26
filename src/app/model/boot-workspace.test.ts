import { beforeEach, expect, it, vi } from "vitest";
import { newSession } from "@/features/sessions/model/session";
import { newTab } from "@/features/workspace/model/layout";
import { collectWorkspaceSnapshot } from "@/features/workspace/model/workspace-snapshot";

const store = vi.hoisted(() => ({
  loadWorkspaceSnapshot: vi.fn(),
  listInFlightSessions: vi.fn(),
  getSession: vi.fn(),
  upsertSession: vi.fn(),
  saveWorkspaceSnapshot: vi.fn(),
  replaceInFlightSessions: vi.fn(),
}));
vi.mock("@/features/sessions/data/session-store", async (original) => ({
  ...(await original<
    typeof import("@/features/sessions/data/session-store")
  >()),
  ...store,
}));
vi.mock("@/integrations/harness/core/registry", () => ({}));
vi.mock("@/integrations/harness/core/child", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  store.listInFlightSessions.mockResolvedValue([]);
  store.upsertSession.mockResolvedValue(null);
  store.saveWorkspaceSnapshot.mockResolvedValue(undefined);
  store.replaceInFlightSessions.mockResolvedValue(undefined);
});

function savedWorkspace() {
  const sessions = Array.from({ length: 10 }, (_, index) => ({
    ...newSession("codex", "/repo"),
    id: `session-${index}`,
    blocks: [{ id: `user-${index}`, role: "user" as const, text: "Hello" }],
  }));
  const tabs = sessions.map((session) => newTab(session.id));
  store.loadWorkspaceSnapshot.mockResolvedValue(
    collectWorkspaceSnapshot(tabs, sessions, tabs[0].id, "/repo", new Map()),
  );
  store.getSession.mockImplementation(
    async (id: string) => sessions.find((session) => session.id === id) ?? null,
  );
  return sessions;
}

it("restores ten idle tabs without rewriting their transcripts before first paint", async () => {
  const sessions = savedWorkspace();
  const { loadResumedWorkspace } = await import("./app-lifecycle");
  const restored = await loadResumedWorkspace();
  expect(restored?.sessions.map((session) => session.id)).toEqual(
    sessions.map((session) => session.id),
  );
  expect(restored?.tabs).toHaveLength(10);
  expect(store.upsertSession).not.toHaveBeenCalled();
});

it("still persists the interruption marker for a recovered running turn", async () => {
  const sessions = savedWorkspace();
  store.listInFlightSessions.mockResolvedValue([
    { sessionId: sessions[0].id, cwd: "/repo" },
  ]);
  const { loadResumedWorkspace } = await import("./app-lifecycle");
  const restored = await loadResumedWorkspace();
  expect(store.upsertSession).toHaveBeenCalledTimes(1);
  expect(store.upsertSession).toHaveBeenCalledWith(restored?.sessions[0]);
  expect(restored?.sessions[0].blocks.at(-1)?.notice).toBe("interrupt");
});

it("boots empty when the saved layout cannot be read", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.loadWorkspaceSnapshot.mockRejectedValue(new Error("disk busy"));
  const { loadResumedWorkspace } = await import("./app-lifecycle");

  await expect(loadResumedWorkspace()).resolves.toBeNull();
  error.mockRestore();
});

it("logs a failed layout load and holds layout writes", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.loadWorkspaceSnapshot.mockRejectedValue(new Error("disk busy"));
  const { loadResumedWorkspace } = await import("./app-lifecycle");
  const { snapshotWritesBlocked } = await import("./workspace-snapshot-guard");

  await loadResumedWorkspace();

  expect(error).toHaveBeenCalledWith(expect.stringContaining("could not load the saved layout"), expect.any(Error));
  expect(snapshotWritesBlocked()).toBe(true);
  error.mockRestore();
});

it("allows layout writes after a successful load", async () => {
  savedWorkspace();
  const { loadResumedWorkspace } = await import("./app-lifecycle");
  const { snapshotWritesBlocked } = await import("./workspace-snapshot-guard");

  await loadResumedWorkspace();

  expect(snapshotWritesBlocked()).toBe(false);
});

it("keeps the unread layout on disk through a reload until the user edits", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.loadWorkspaceSnapshot.mockRejectedValue(new Error("disk busy"));
  const { loadResumedWorkspace, persistQuitState } = await import("./app-lifecycle");
  const { releaseSnapshotWrites } = await import("./workspace-snapshot-guard");
  const session = newSession("codex", "/repo");
  const tabs = [newTab(session.id)];
  const unload = () => persistQuitState([session], tabs, tabs[0].id, "/repo", new Map(), "unload");
  await loadResumedWorkspace();

  await unload();
  expect(store.saveWorkspaceSnapshot).not.toHaveBeenCalled();

  releaseSnapshotWrites();
  await unload();
  expect(store.saveWorkspaceSnapshot).toHaveBeenCalledOnce();
  error.mockRestore();
});
