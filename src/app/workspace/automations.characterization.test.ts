// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";

// Pins how an automation run starts a session before launchAutomation leaves
// App.tsx for flows/automations (global refactor, Stage 5).

vi.setConfig({ testTimeout: 60_000 });

let app: AppHarness | undefined;

afterEach(async () => {
  await app?.unmount();
  app = undefined;
});

function current(): AppHarness {
  if (!app) throw new Error("App not rendered");
  return app;
}

const automation = {
  id: "auto-1",
  name: "Nightly report",
  prompt: "Summarize yesterday's commits",
  harness: "cursor",
  model: "",
  cwd: "/work/demo",
  workspaceMode: "current",
  reuseSession: false,
  runtimeMode: "supervised",
  triggerKind: "time",
  triggerEvent: "",
  scheduleKind: "daily",
  minute: 0,
  time: "09:00",
  dayOfWeek: 1,
  missedRunGraceMinutes: 60,
  enabled: true,
  nextRunAt: Date.now() + 86_400_000,
  createdAt: 1,
  updatedAt: 1,
};
const run = {
  id: "run-1",
  automationId: "auto-1",
  trigger: "schedule",
  scheduledFor: 1,
  createdAt: 1,
  status: "pending",
};

const runStatuses = (harness: AppHarness) =>
  harness.commands("automation_run_update").map((call) => call.args?.status);

describe("Workspace automations", () => {
  it("starts an interrupted run in a new session and records how it ended", async () => {
    app = await renderApp({
      project: "/work/demo",
      routes: {
        automation_runs_recover: () => [{ automation, run }],
        automation_run_update: (args) => ({ ...run, status: args?.status }),
      },
    });

    await app.until(() => current().harness.turns.length === 1);
    expect(app.harness.turns[0]?.text).toContain("Summarize yesterday's commits");
    expect(runStatuses(app)).toEqual(["running"]);
    expect(app.commands("automation_run_update")[0]?.args?.sessionId).toBe(
      app.harness.turns[0]?.sessionId,
    );

    await app.drive(() => {
      current().harness.send({ type: "message.delta", text: "Three commits." });
      current().harness.send({ type: "message.completed" });
      current().harness.finish();
    });
    await app.until(() => runStatuses(current()).includes("succeeded"));
  });
});
