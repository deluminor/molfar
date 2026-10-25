// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { type OrchestrationRun, orchestrator } from "@/features/orchestration/model/orchestration";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { useOrchestrationSync } from "./use-orchestration-sync";

const run: OrchestrationRun = {
  version: 1,
  leadId: "lead",
  cwd: "/repo",
  status: "active",
  allowedHarnesses: ["claude"],
  maxWorkers: 1,
  cli: "molfar",
  tasks: [
    {
      id: "worker",
      sessionId: "worker",
      title: "worker",
      harness: "claude",
      model: "claude:test",
      prompt: "Work",
      files: [],
      scopes: [],
      dependsOn: [],
      status: "running",
      accepted: false,
      result: "",
      delivered: false,
    },
  ],
  continuations: 0,
  requests: {},
};

function session(id: string): Session {
  return { ...testSession("claude", "/repo"), id };
}

function render(runs: OrchestrationRun[], tabs: WorkspaceTab[], activeTabId: string) {
  const sessions = [session("lead"), session("worker")];
  let updated: Session[] = sessions;
  const deps = {
    setSessions: vi.fn((update: (previous: Session[]) => Session[]) => {
      updated = update(updated);
    }),
    setTabs: vi.fn(),
    setActiveTabId: vi.fn(),
  };
  function Probe() {
    useOrchestrationSync(runs, sessions, tabs, activeTabId, deps);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  act(() => root.unmount());
  return { deps, updated: () => updated };
}

describe("useOrchestrationSync", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.restoreAllMocks();
  });

  it("ties workers to their lead and folds a worker tab into the open lead", () => {
    const sync = vi.spyOn(orchestrator, "sync").mockImplementation(() => {});
    const lead = { ...newTab("lead"), id: "t1" };
    const worker = { ...newTab("worker"), id: "t2" };
    const { deps, updated } = render([run], [lead, worker], "t2");

    expect(updated().find((entry) => entry.id === "worker")?.orchestrationLeadId).toBe("lead");
    expect(deps.setTabs).toHaveBeenCalledWith([lead]);
    expect(deps.setActiveTabId).toHaveBeenCalledWith("t1");
    expect(sync).toHaveBeenCalledOnce();
  });

  it("leaves tabs and sessions alone without runs", () => {
    vi.spyOn(orchestrator, "sync").mockImplementation(() => {});
    const tabs = [{ ...newTab("lead"), id: "t1" }];
    const { deps, updated } = render([], tabs, "t1");

    expect(updated().every((entry) => entry.orchestrationLeadId === undefined)).toBe(true);
    expect(deps.setTabs).not.toHaveBeenCalled();
    expect(deps.setActiveTabId).not.toHaveBeenCalled();
  });
});
