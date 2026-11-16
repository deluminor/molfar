// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, shows } from "./testing/workspace-steps";

// Pins stopping and compacting a turn before they leave App.tsx for
// flows/turn-control (global refactor, Stage 5).

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

function pressEscape(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

describe("Workspace turn control: stop and compact", () => {
  it("stops the focused running turn on Escape", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("explain the build");
    await app.until(() => current().harness.turns.length === 1);
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.drive(pressEscape);
    await app.until(() => current().harness.cancelled.length === 1);

    expect(app.harness.cancelled).toEqual([sessionId]);
  });

  it("leaves an idle session alone on Escape", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "It uses Vite.");

    await app.drive(pressEscape);
    await app.settle(50);

    expect(app.harness.cancelled).toEqual([]);
  });

  it("compacts the session's context on /compact without sending a turn", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "It uses Vite.");
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.submitPrompt("/compact");
    await app.until(() => current().harness.compacted.length === 1);
    await app.until(() => shows(current(), "Status update"));

    expect(app.harness.compacted).toEqual([sessionId]);
    expect(app.harness.turns).toHaveLength(1);
  });
});
