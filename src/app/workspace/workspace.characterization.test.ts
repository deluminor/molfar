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

type UpsertArgs = { session: { blocks: { role: string }[] } };

function sessionOf(call: { args: unknown } | undefined) {
  return (call?.args as UpsertArgs | undefined)?.session;
}

function roles(call: { args: unknown } | undefined): string[] {
  return sessionOf(call)?.blocks.map((block) => block.role) ?? [];
}
