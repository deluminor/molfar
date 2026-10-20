import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { OrchestrationRun, OrchestrationTask } from "@/features/orchestration/model/orchestration-state";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { createWorker } from "./create-worker";
import { cleanupWorker } from "./worker-checkout";
import { steerWorker } from "./worker-control";
import type { WorkerDeps } from "./worker-deps";

const native = vi.hoisted(() => ({
  invoked: [] as string[],
  saved: null as Session | null,
  steered: [] as string[],
  trees: [] as Array<{ path: string; head: string; branch: string | null }>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    native.invoked.push(command);
    return command === "control_attach_worker" ? "/tmp/scratch" : undefined;
  },
}));
vi.mock("@/features/sessions/data/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sessions/data/session-store")>()),
  getSession: async () => native.saved,
  upsertSession: vi.fn(async () => undefined),
}));
vi.mock("@/features/source-control/model/worktrees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/source-control/model/worktrees")>()),
  listWorktrees: async () => ({ worktrees: native.trees }),
  createOrchestrationWorktree: async () => ({ path: "/work/demo-w1", branch: "w1" }),
}));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  flushSessionCheckpoint: vi.fn(async () => undefined),
  applySessionCheckpoint: vi.fn(async () => ({ files: [], alreadyApplied: 0 })),
  sessionCheckpointCleanupSafe: vi.fn(async () => false),
  forgetSessionCheckpoint: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  isLiveHarness: () => true,
  canSteerHarness: () => true,
  steerHarnessTurn: async (input: { text: string }) => {
    native.steered.push(input.text);
  },
}));

const lead = { ...testSession("claude", "/work/demo"), id: "lead", runtimeMode: "auto" as const };
const run = { version: 2, leadId: "lead", cwd: "/work/demo", tasks: [] } as unknown as OrchestrationRun;
const task = {
  id: "t1",
  sessionId: "w1",
  title: "Write tests",
  harness: "claude",
  model: lead.model,
} as OrchestrationTask;

function setup(sessions: Session[] = [lead]) {
  const sessionsRef = { current: sessions };
  const deps = {
    store: createWorkspaceStore(testWorkspaceState({ sessions })),
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    submitSession: vi.fn(() => true),
    stop: vi.fn(),
    flushHarnessEvents: vi.fn(),
    checkOpenWorktreeFiles: vi.fn(),
  } satisfies WorkerDeps;
  return { deps, sessions: () => sessionsRef.current };
}

beforeEach(() => {
  native.invoked = [];
  native.saved = null;
  native.steered = [];
  native.trees = [];
});

describe("orchestration workers", () => {
  it("creates a worker in its own worktree under the lead's permission mode", async () => {
    const { deps, sessions } = setup();

    const prepared = await createWorker(deps, run, task);

    expect(prepared.scratchDir).toBe("/tmp/scratch");
    expect(sessions()[1]).toMatchObject({
      id: "w1",
      title: "Write tests",
      worktreeCwd: "/work/demo-w1",
      runtimeMode: "auto",
      orchestrationLeadId: "lead",
    });
  });

  it("refuses a saved worker whose model no longer matches", async () => {
    native.saved = { ...testSession("codex", "/work/demo"), id: "w1" };
    const { deps } = setup();

    await expect(createWorker(deps, run, task)).rejects.toThrow("no longer matches its approved model");
  });

  it("keeps a worktree whose branch moved when cleanup must not lose changes", async () => {
    native.trees = [
      { path: "/work/demo-w1", head: "a", branch: "w1" },
      { path: "/work/demo", head: "b", branch: "main" },
    ];
    const { deps } = setup();
    const retained = { ...task, workspace: { kind: "worktree", checkoutCwd: "/work/demo-w1" } } as OrchestrationTask;

    expect(await cleanupWorker(deps, run, retained, true)).toBe(false);
    await expect(cleanupWorker(deps, run, retained, false)).rejects.toThrow("branch moved before cleanup");
  });

  it("steers a running worker and records the guidance in its transcript", async () => {
    const worker = { ...testSession("claude", "/work/demo"), id: "w1", busy: true };
    const { deps, sessions } = setup([lead, worker]);

    await steerWorker(deps, "w1", "Focus on the parser");

    expect(native.steered).toEqual(["Focus on the parser"]);
    expect(sessions()[1].blocks.at(-1)).toMatchObject({ role: "user", text: "Focus on the parser" });
  });

  it("refuses to steer an idle worker", async () => {
    const { deps } = setup([lead, { ...testSession("claude", "/work/demo"), id: "w1" }]);

    await expect(steerWorker(deps, "w1", "x")).rejects.toThrow("not running a turn");
  });
});
