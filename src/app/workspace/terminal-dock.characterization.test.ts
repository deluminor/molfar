// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, shows } from "./testing/workspace-steps";

// Pins the project terminal dock before terminals leave App.tsx
// (global refactor, Stage 5).

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

function dock(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-project-terminal-dock]");
}

function dockShown(): boolean {
  return Boolean(dock()?.closest("[data-dock-shown]"));
}

function dockTerminals(): number {
  return dock()?.querySelectorAll("[data-file-id], [role=tab]").length ?? 0;
}

function dockFocused(): boolean {
  return Boolean(document.activeElement?.closest("[data-project-terminal-dock]"));
}

/** Workspace drops a repeat of the same command within 80ms. */
function outlastCommandDebounce(): Promise<void> {
  return current().settle(100);
}

function spawns(): number {
  return current().commands("pty_spawn").length;
}

describe("Workspace terminal dock", () => {
  it("hides the project terminal on toggle_terminal and brings the same one back", async () => {
    app = await renderApp({ project: "/work/demo" });

    await app.emit("toggle_terminal");
    await app.until(() => dockShown() && spawns() === 1 && dockFocused());

    await outlastCommandDebounce();
    await app.emit("toggle_terminal");
    await app.until(() => !dockShown());

    await outlastCommandDebounce();
    await app.emit("toggle_terminal");
    await app.until(() => dockShown());
    expect(spawns()).toBe(1);
  });

  it("adds a terminal to the dock on new_terminal", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.emit("toggle_terminal");
    await app.until(() => spawns() === 1);

    await app.emit("new_terminal");

    await app.until(() => spawns() === 2 && dockTerminals() === 2);
    expect(app.commands("pty_spawn")[1]?.args).toMatchObject({ cwd: "/work/demo" });
  });

  it("closes the focused dock terminal on close_tab and keeps the conversation", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "The build uses Vite.");
    await app.emit("toggle_terminal");
    await app.emit("new_terminal");
    await app.until(() => dockTerminals() === 2);
    await app.until(dockFocused);

    await app.emit("close_tab");

    await app.until(() => dockTerminals() === 1);
    expect(shows(app, "The build uses Vite.")).toBe(true);
  });

  it("asks before closing a dock terminal whose process still runs", async () => {
    app = await renderApp({
      project: "/work/demo",
      routes: { pty_status: () => ({ foreground: "npm" }) },
    });
    await app.emit("toggle_terminal");
    await app.emit("new_terminal");
    await app.until(() => dockTerminals() === 2);
    await app.until(dockFocused);

    await app.emit("close_tab");
    await app.until(() => document.body.textContent?.includes('"npm" is still running') ?? false);
    const cancel = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    await app.drive(() => cancel?.click());
    await app.until(() => !document.body.textContent?.includes('"npm" is still running'));
    expect(dockTerminals()).toBe(2);
  });
});
