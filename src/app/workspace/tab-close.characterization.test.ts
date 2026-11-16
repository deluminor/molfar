// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, shows, tabIds } from "./testing/workspace-steps";

// Pins how panes, terminal tabs and title tabs close before the closing
// handlers leave App.tsx (global refactor, Stage 5).

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

function paneCount(): number {
  return current().host.querySelectorAll("[data-pane-id]").length;
}

const PROJECT_FILES = {
  list_project_files: () => [
    { name: "notes.md", path: "/work/demo/notes.md", relative: "notes.md" },
  ],
  read_text_file: () => "Release notes",
};

function fileTabOpen(name: string): boolean {
  return [...current().host.querySelectorAll("[data-pane-id]")].some(
    (pane) =>
      pane.getAttribute("aria-hidden") !== "true" &&
      Boolean(pane.textContent?.includes(name)) &&
      !pane.querySelector("[data-composer]"),
  );
}

async function openFile(name: string) {
  const app = current();
  await app.emit("go_to_file");
  await app.until(() => Boolean(document.querySelector("[data-file-picker] input")));
  const input = document.querySelector<HTMLInputElement>("[data-file-picker] input");
  await app.drive(() => {
    if (!input) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await app.until(() =>
    Boolean(document.querySelector("[data-file-picker] li, [data-file-picker] [role=option]")),
  );
  await app.drive(() => {
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await app.until(() => fileTabOpen(name));
}

describe("Workspace closing", () => {
  it("closes the focused split pane and keeps the other conversation", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "The build uses Vite.");
    await app.emit("split_right");
    await app.until(() => paneCount() === 2);

    await app.emit("close_tab");

    await app.until(() => paneCount() === 1);
    expect(tabIds(app)).toHaveLength(1);
    expect(shows(app, "The build uses Vite.")).toBe(true);
  });

  it("closes an open file with close_tab and keeps the conversation", async () => {
    app = await renderApp({ project: "/work/demo", routes: PROJECT_FILES });
    await answeredSession(app, "explain the build", "The build uses Vite.");
    await openFile("notes.md");

    await app.emit("close_tab");

    await app.until(() => !fileTabOpen("notes.md"));
    expect(tabIds(app)).toHaveLength(1);
    expect(shows(app, "The build uses Vite.")).toBe(true);
  });

  it("closes open files first on close all, then starts the tab over", async () => {
    app = await renderApp({ project: "/work/demo", routes: PROJECT_FILES });
    await answeredSession(app, "explain the build", "The build uses Vite.");
    await openFile("notes.md");

    await app.emit("close_all_tabs");
    await app.until(() => !fileTabOpen("notes.md"));
    expect(shows(app, "The build uses Vite.")).toBe(true);

    await app.emit("close_all_tabs");
    await app.until(() => shows(current(), "What should we work on in demo?"));
    expect(shows(app, "The build uses Vite.")).toBe(false);
  });

  it("closes a background tab from its title tab close button", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "first", "One.");
    await app.emit("new_tab");
    await answeredSession(app, "second", "Two.");
    const [first, second] = tabIds(app);
    const close = app.host.querySelector<HTMLElement>(
      `[data-title-tab-id="${first}"] [aria-label^="Close "]`,
    );
    expect(close).not.toBeNull();

    await app.drive(() => close?.click());

    await app.until(() => tabIds(current()).length === 1);
    expect(tabIds(app)).toEqual([second]);
    expect(shows(app, "Two.")).toBe(true);
    expect(app.commands("session_delete")).toHaveLength(0);
  });
});
