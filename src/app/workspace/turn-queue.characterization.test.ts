// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { shows } from "./testing/workspace-steps";

// Pins the follow-up queue before it leaves App.tsx for flows/turn-queue
// (global refactor, Stage 5). Follow-ups are set to queue, so one sent
// during a turn waits for it to end.

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

async function queuedFollowUp(): Promise<AppHarness> {
  const rendered = await renderApp({
    project: "/work/demo",
    storage: { "molfar.followUpBehavior": "queue" },
  });
  await rendered.submitPrompt("explain the build");
  await rendered.until(() => rendered.harness.turns.length === 1);
  await rendered.submitPrompt("also check the tests");
  await rendered.until(() => shows(rendered, "also check the tests"));
  return rendered;
}

describe("Workspace turn queue", () => {
  it("sends a queued follow-up once the running turn ends", async () => {
    app = await queuedFollowUp();
    expect(app.harness.turns).toHaveLength(1);

    await app.drive(() => current().harness.finish());
    await app.until(() => current().harness.turns.length === 2);

    expect(app.harness.steers).toEqual([]);
    expect(app.harness.turns[1]).toMatchObject({ text: "also check the tests" });
  });

  it("pauses the queue on Stop and continues the turn on Resume", async () => {
    app = await queuedFollowUp();

    await app.click("Stop");
    await app.until(() => shows(current(), "Queue paused because you interrupted"));
    expect(app.harness.turns).toHaveLength(1);

    await app.click("Resume");
    await app.until(() => current().harness.turns.length === 2);

    expect(app.harness.turns[1]).toMatchObject({ text: CONTINUE_PROMPT });
  });

  it("drops a removed follow-up from the queue", async () => {
    app = await queuedFollowUp();

    await app.click("Remove queued message");
    await app.drive(() => current().harness.finish());
    await app.settle(100);

    expect(app.harness.turns).toHaveLength(1);
  });
});
