// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";

// Pins Workspace behaviour before App.tsx is split into a store, slices and
// flows (global refactor, Stage 5).

let app: AppHarness | undefined;

afterEach(async () => {
  await app?.unmount();
  app = undefined;
});

function tabIds(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>("[data-title-tab-id]")].map(
    (tab) => tab.dataset.titleTabId ?? "",
  );
}

async function answeredSession(prompt: string, reply: string) {
  const current = app;
  if (!current) throw new Error("App not rendered");
  await current.submitPrompt(prompt);
  await current.drive(() => {
    current.harness.send({ type: "message.delta", text: reply });
    current.harness.send({ type: "message.completed" });
    current.harness.finish();
  });
}

describe("Workspace boot", () => {
  it("opens one blank session tab with an empty composer", async () => {
    app = await renderApp();

    expect(tabIds(app.host)).toHaveLength(1);
    expect(app.visibleText()).toContain("What should we work on?");
  });

  it("loads notes, automations and reminders on launch", async () => {
    app = await renderApp();

    const commands = new Set(app.calls.map((call) => call.command));
    expect(commands).toContain("notes_list");
    expect(commands).toContain("automations_list");
    expect(commands).toContain("reminder_list");
  });
});

describe("Workspace submit", () => {
  it("sends the prompt to the session's harness and streams the reply", async () => {
    app = await renderApp({ project: "/work/demo" });

    await answeredSession("explain the build", "The build uses Vite.");

    expect(app.harness.turns).toHaveLength(1);
    expect(app.harness.turns[0]).toMatchObject({
      text: "explain the build",
      cwd: "/work/demo",
      model: "cursor:composer-2.5",
    });
    expect(app.visibleText()).toContain("explain the build");
    expect(app.visibleText()).toContain("The build uses Vite.");
  });

  it("persists the user turn at once and the answered transcript after it settles", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("explain the build");
    const first = app.commands("session_upsert");
    expect(first).toHaveLength(1);
    expect(roles(first[0])).toEqual(["user"]);

    await app.drive(() => {
      app?.harness.send({
        type: "message.delta",
        text: "The build uses Vite.",
      });
      app?.harness.send({ type: "message.completed" });
      app?.harness.finish();
    });
    await app.settle(800);

    const upserts = app.commands("session_upsert");
    const saved = upserts[upserts.length - 1];
    expect(roles(saved)).toEqual(["user", "assistant"]);
    expect(sessionOf(saved)).toMatchObject({
      cwd: "/work/demo",
      harness: "cursor",
      title: "cursor · explain the build",
    });
  });

  it("does not persist sessions outside a project", async () => {
    app = await renderApp();

    await answeredSession("hello", "Hi.");
    await app.settle(800);

    expect(app.commands("session_upsert")).toHaveLength(0);
  });
});

describe("Workspace tabs", () => {
  it("shows a blank new tab in place of the blank one it was opened from", async () => {
    app = await renderApp();
    const [first] = tabIds(app.host);

    await app.emit("new_tab");
    const [opened] = tabIds(app.host);
    expect(tabIds(app.host)).toHaveLength(1);
    expect(opened).not.toBe(first);

    await app.emit("close_tab");
    expect(tabIds(app.host)).toEqual([first]);
  });

  it("keeps an answered session's tab next to a new tab and closes back to it", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("explain the build", "The build uses Vite.");
    const [answered] = tabIds(app.host);

    await app.emit("new_tab");
    const tabs = tabIds(app.host);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toBe(answered);

    await app.emit("close_tab");
    expect(tabIds(app.host)).toEqual([answered]);
    expect(app.commands("session_delete")).toHaveLength(0);
  });

  it("reorders tabs when one is dragged past its neighbour", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const [first, second] = tabIds(app.host);
    layOutTabsInARow(app.host);

    await app.drive(() => {
      const handle = app?.host.querySelector(
        "[data-title-tab-id] .reorder-item",
      );
      handle?.dispatchEvent(pointer("pointerdown", 50));
      window.dispatchEvent(pointer("pointermove", 180));
    });
    await app.drive(() => {
      window.dispatchEvent(pointer("pointerup", 180));
    });
    await app.settle(400);

    expect(tabIds(app.host)).toEqual([second, first]);
  });

  it("moves between tabs with next_tab and prev_tab", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const tabs = tabIds(app.host);
    expect(tabs).toHaveLength(2);
    expect(app.visibleText()).toContain("Two.");

    await app.emit("prev_tab");
    expect(app.visibleText()).toContain("One.");
    expect(app.visibleText()).not.toContain("Two.");

    await app.emit("next_tab");
    expect(app.visibleText()).toContain("Two.");
    expect(app.visibleText()).not.toContain("One.");
    expect(tabIds(app.host)).toEqual(tabs);
  });
});

describe("Workspace turn control", () => {
  it("steers a running turn with a follow-up instead of starting another", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("explain the build");
    await app.submitPrompt("also check the tests");

    expect(app.harness.turns).toHaveLength(1);
    expect(app.harness.steers).toHaveLength(1);
    expect(app.harness.steers[0]).toMatchObject({
      text: "also check the tests",
    });
  });

  it("cancels the running turn from the Stop button", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("explain the build");
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.click("Stop");

    expect(app.harness.cancelled).toEqual([sessionId]);
  });

  it("answers an approval request from the transcript", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("run the tests");
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.drive(() => {
      app?.harness.send({
        type: "approval.requested",
        requestId: 7,
        title: "Run npm test",
        kind: "execute",
      });
    });
    await app.click("Allow");

    expect(app.harness.approvals).toEqual([
      { sessionId, requestId: 7, decision: "allow" },
    ]);
  });
});

describe("Workspace panes", () => {
  it("splits the focused pane on split_right", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("explain the build", "The build uses Vite.");

    await app.emit("split_right");

    expect(app.host.querySelectorAll("[data-pane-id]")).toHaveLength(2);
  });

  it("closes other tabs, then starts the last one over on close all", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const [, second] = tabIds(app.host);

    await app.emit("close_other_tabs");
    expect(tabIds(app.host)).toEqual([second]);

    // Close All keeps the active tab and starts it over on a blank session.
    await app.emit("close_all_tabs");
    expect(tabIds(app.host)).toEqual([second]);
    expect(app.visibleText()).toContain("What should we work on in demo?");
    expect(app.visibleText()).not.toContain("Two.");
  });
});

describe("Workspace terminal", () => {
  it("starts a project terminal on toggle_terminal", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.emit("toggle_terminal");
    await app.settle(200);

    const spawned = app.commands("pty_spawn");
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned[0]?.args).toMatchObject({ cwd: "/work/demo" });
  });
});

function pointer(type: string, clientX: number): Event {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY: 16,
    pointerId: 1,
  });
}

/** happy-dom has no layout: give each title tab a 100px slot in a row. */
function layOutTabsInARow(host: HTMLElement) {
  const tabs = host.querySelectorAll<HTMLElement>(
    "[data-title-tab-id] .reorder-item",
  );
  tabs.forEach((tab, index) => {
    const left = index * 100;
    const rect = { left, right: left + 100, width: 100, x: left };
    tab.getBoundingClientRect = () =>
      ({ ...rect, top: 0, bottom: 32, height: 32, y: 0 }) as DOMRect;
    tab.setPointerCapture = () => {};
    tab.hasPointerCapture = () => true;
    tab.releasePointerCapture = () => {};
  });
}

type UpsertArgs = { session: { blocks: { role: string }[] } };

function sessionOf(call: { args: unknown } | undefined) {
  return (call?.args as UpsertArgs | undefined)?.session;
}

function roles(call: { args: unknown } | undefined): string[] {
  return sessionOf(call)?.blocks.map((block) => block.role) ?? [];
}
