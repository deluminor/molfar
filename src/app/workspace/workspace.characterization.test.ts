// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";

// Pins Workspace behaviour before App.tsx is split into a store, slices and
// flows (global refactor, Stage 5). Every step waits for the state it expects
// instead of sleeping, so the suite holds up on a loaded machine.

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

function tabIds(): string[] {
  return [
    ...current().host.querySelectorAll<HTMLElement>("[data-title-tab-id]"),
  ].map((tab) => tab.dataset.titleTabId ?? "");
}

function shows(text: string): boolean {
  return current().visibleText().includes(text);
}

async function answeredSession(prompt: string, reply: string) {
  const harness = current().harness;
  const turnsBefore = harness.turns.length;
  await current().submitPrompt(prompt);
  await current().until(() => harness.turns.length > turnsBefore);
  await current().drive(() => {
    harness.send({ type: "message.delta", text: reply });
    harness.send({ type: "message.completed" });
    harness.finish();
  });
  await current().until(() => shows(reply));
}

describe("Workspace boot", () => {
  it("opens one blank session tab with an empty composer", async () => {
    app = await renderApp();

    expect(tabIds()).toHaveLength(1);
    expect(shows("What should we work on?")).toBe(true);
  });

  it("loads notes, automations and reminders on launch", async () => {
    app = await renderApp();
    const loaded = () => new Set(current().calls.map((call) => call.command));

    await app.until(() =>
      ["notes_list", "automations_list", "reminder_list"].every((command) =>
        loaded().has(command),
      ),
    );
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
    expect(shows("explain the build")).toBe(true);
  });

  it("persists the user turn at once and the answered transcript after it settles", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("explain the build");
    await app.until(() => upserts().length === 1);
    expect(roles(upserts()[0])).toEqual(["user"]);

    await app.drive(() => {
      current().harness.send({
        type: "message.delta",
        text: "The build uses Vite.",
      });
      current().harness.send({ type: "message.completed" });
      current().harness.finish();
    });
    await app.until(() => roles(lastUpsert()).length === 2);

    expect(roles(lastUpsert())).toEqual(["user", "assistant"]);
    expect(sessionOf(lastUpsert())).toMatchObject({
      cwd: "/work/demo",
      harness: "cursor",
      title: "cursor · explain the build",
    });
  });

  it("does not persist sessions outside a project", async () => {
    app = await renderApp();

    await answeredSession("hello", "Hi.");
    // The answered-transcript save is debounced by 650ms.
    await app.settle(1_000);

    expect(app.commands("session_upsert")).toHaveLength(0);
  });
});

describe("Workspace tabs", () => {
  it("shows a blank new tab in place of the blank one it was opened from", async () => {
    app = await renderApp();
    const [first] = tabIds();

    await app.emit("new_tab");
    await app.until(() => tabIds()[0] !== first);
    expect(tabIds()).toHaveLength(1);

    await app.emit("close_tab");
    await app.until(() => tabIds()[0] === first);
    expect(tabIds()).toEqual([first]);
  });

  it("keeps an answered session's tab next to a new tab and closes back to it", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("explain the build", "The build uses Vite.");
    const [answered] = tabIds();

    await app.emit("new_tab");
    await app.until(() => tabIds().length === 2);
    expect(tabIds()[0]).toBe(answered);

    await app.emit("close_tab");
    await app.until(() => tabIds().length === 1);
    expect(tabIds()).toEqual([answered]);
    expect(app.commands("session_delete")).toHaveLength(0);
  });

  it("reorders tabs when one is dragged past its neighbour", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const [first, second] = tabIds();
    layOutTabsInARow(app.host);

    await app.drive(() => {
      const handle = current().host.querySelector(
        "[data-title-tab-id] .reorder-item",
      );
      handle?.dispatchEvent(pointer("pointerdown", 50));
      window.dispatchEvent(pointer("pointermove", 180));
    });
    await app.drive(() => {
      window.dispatchEvent(pointer("pointerup", 180));
    });

    await app.until(() => tabIds()[0] === second);
    expect(tabIds()).toEqual([second, first]);
  });

  it("moves between tabs with next_tab and prev_tab", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const tabs = tabIds();
    expect(tabs).toHaveLength(2);

    await app.emit("prev_tab");
    await app.until(() => shows("One.") && !shows("Two."));

    await app.emit("next_tab");
    await app.until(() => shows("Two.") && !shows("One."));
    expect(tabIds()).toEqual(tabs);
  });
});

describe("Workspace harness events", () => {
  it("joins deltas that arrive together into one message", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("explain the build");
    await app.until(() => current().harness.turns.length === 1);

    await app.drive(() => {
      current().harness.send({ type: "message.delta", text: "The build " });
      current().harness.send({ type: "message.delta", text: "uses " });
      current().harness.send({ type: "message.delta", text: "Vite." });
    });

    await app.until(() => shows("The build uses Vite."));
  });

  it("applies a background tab's stream so it shows on return", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("explain the build");
    await app.until(() => current().harness.turns.length === 1);
    await app.emit("new_tab");
    await app.until(() => tabIds().length === 2);

    await app.drive(() => {
      current().harness.send({
        type: "message.delta",
        text: "Streamed while hidden.",
      });
      current().harness.send({ type: "message.completed" });
      current().harness.finish();
    });
    await app.emit("prev_tab");

    await app.until(() => shows("Streamed while hidden."));
  });
});

describe("Workspace turn control", () => {
  it("steers a running turn with a follow-up instead of starting another", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.submitPrompt("explain the build");
    await app.until(() => current().harness.turns.length === 1);
    await app.submitPrompt("also check the tests");
    await app.until(() => current().harness.steers.length === 1);

    expect(app.harness.turns).toHaveLength(1);
    expect(app.harness.steers[0]).toMatchObject({
      text: "also check the tests",
    });
  });

  it("cancels the running turn from the Stop button", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("explain the build");
    await app.until(() => current().harness.turns.length === 1);
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.click("Stop");
    await app.until(() => current().harness.cancelled.length === 1);

    expect(app.harness.cancelled).toEqual([sessionId]);
  });

  it("answers an approval request from the transcript", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.submitPrompt("run the tests");
    await app.until(() => current().harness.turns.length === 1);
    const sessionId = app.harness.turns[0]?.sessionId;

    await app.drive(() => {
      current().harness.send({
        type: "approval.requested",
        requestId: 7,
        title: "Run npm test",
        kind: "execute",
      });
    });
    await app.click("Allow");
    await app.until(() => current().harness.approvals.length === 1);

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

    await app.until(
      () => current().host.querySelectorAll("[data-pane-id]").length === 2,
    );
  });

  it("closes other tabs, then starts the last one over on close all", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession("first", "One.");
    await app.emit("new_tab");
    await answeredSession("second", "Two.");
    const [, second] = tabIds();

    await app.emit("close_other_tabs");
    await app.until(() => tabIds().length === 1);
    expect(tabIds()).toEqual([second]);

    // Close All keeps the active tab and starts it over on a blank session.
    await app.emit("close_all_tabs");
    await app.until(() => shows("What should we work on in demo?"));
    expect(tabIds()).toEqual([second]);
    expect(shows("Two.")).toBe(false);
  });
});

describe("Workspace terminal", () => {
  it("starts a project terminal on toggle_terminal", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.emit("toggle_terminal");
    await app.until(() => current().commands("pty_spawn").length > 0);

    expect(app.commands("pty_spawn")[0]?.args).toMatchObject({
      cwd: "/work/demo",
    });
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

function upserts() {
  return current().commands("session_upsert");
}

function lastUpsert() {
  const all = upserts();
  return all[all.length - 1];
}

function sessionOf(call: { args: unknown } | undefined) {
  return (call?.args as UpsertArgs | undefined)?.session;
}

function roles(call: { args: unknown } | undefined): string[] {
  return sessionOf(call)?.blocks.map((block) => block.role) ?? [];
}
