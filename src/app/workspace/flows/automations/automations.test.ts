import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { Automation, AutomationRun } from "@/features/automations/model/automations";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { Submit } from "../submission/submit-types";
import type { AutomationDeps } from "./automation-deps";
import { createAutomationRuns } from "./automation-runs";
import { reusableSession } from "./automation-session";

const store = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; status: string; options: unknown }>,
  recovered: [] as unknown[],
}));

vi.mock("@/features/automations/model/automations", () => ({
  updateAutomationRun: async (id: string, status: string, options: unknown) => {
    store.updates.push({ id, status, options });
  },
  recoverAutomationRuns: async () => store.recovered,
}));

const automation = {
  id: "a",
  name: "Nightly",
  prompt: "Summarize",
  harness: "claude",
  model: "",
  cwd: "/work/demo",
  workspaceMode: "current",
  reuseSession: true,
  runtimeMode: "supervised",
  lastSessionId: "s",
} as Automation;
const run = { id: "r", automationId: "a", trigger: "schedule", status: "pending" } as AutomationRun;

function setup(sessions: Session[], submit: Submit) {
  const sessionsRef = { current: sessions };
  const deps = {
    store: createWorkspaceStore(testWorkspaceState({ sessions })),
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    tabsRef: { current: [] },
    appendTab: vi.fn(),
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
    focusOpenSession: vi.fn(),
    setSidebarTab: vi.fn(),
    closeAutomations: vi.fn(),
    submitSession: submit,
    saveDraft: vi.fn(() => true),
  } satisfies AutomationDeps;
  return { deps, sessions: () => sessionsRef.current };
}

const settles =
  (status: "completed" | "failed"): Submit =>
  (_id, _text, _attachments, options) => {
    options?.onSettled?.({ status, text: "" });
    return true;
  };

beforeEach(() => {
  store.updates = [];
  store.recovered = [];
});

describe("automation runs", () => {
  it("reuses the automation's last free session in the same project", () => {
    const last = { ...testSession("claude", "/work/demo"), id: "s" };

    expect(reusableSession([last], automation, new Set())?.id).toBe("s");
    expect(reusableSession([last], automation, new Set(["s"]))).toBeUndefined();
    expect(reusableSession([{ ...last, busy: true }], automation, new Set())).toBeUndefined();
  });

  it("runs in a new tab when no session can be reused and records success", async () => {
    const { deps, sessions } = setup([], settles("completed"));

    await createAutomationRuns(deps).launch({ ...automation, reuseSession: false }, run);

    expect(sessions()[0]).toMatchObject({ automationId: "a", cwd: "/work/demo" });
    expect(deps.appendTab).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(store.updates.map((update) => update.status)).toEqual(["running", "succeeded"]),
    );
  });

  it("records a failed submission and frees the session for the next run", async () => {
    const reused = { ...testSession("claude", "/work/demo"), id: "s" };
    const { deps } = setup([reused], settles("failed"));
    const runs = createAutomationRuns(deps);

    await runs.launch(automation, run);
    await vi.waitFor(() => expect(store.updates.at(-1)?.status).toBe("failed"));
    await runs.launch(automation, { ...run, id: "r2" });

    expect(store.updates.filter((update) => update.status === "running")).toHaveLength(2);
  });

  it("recovers interrupted runs once per app start", async () => {
    store.recovered = [{ automation: { ...automation, reuseSession: false }, run }];
    const submit = vi.fn(settles("completed"));
    const { deps } = setup([], submit);
    const runs = createAutomationRuns(deps);

    await Promise.all([runs.ensureRecovery(), runs.ensureRecovery()]);

    expect(submit).toHaveBeenCalledTimes(1);
  });
});
