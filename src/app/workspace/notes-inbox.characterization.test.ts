// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, shows, tabIds } from "./testing/workspace-steps";

// Pins notes and inbox entry points before they leave App.tsx for their
// flows (global refactor, Stage 5).

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

const note = {
  id: "n1",
  slug: "release-notes",
  title: "Release notes",
  body: "Ship v2 on Friday",
  sourceCwd: "/work/demo",
};

describe("Workspace notes", () => {
  it("starts a new chat carrying a note added to chat", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "It uses Vite.");
    const before = tabIds(app);

    await app.drive(() => {
      window.dispatchEvent(new CustomEvent("molfar:add-note-to-chat", { detail: note }));
    });
    await app.until(() => tabIds(current()).length === before.length + 1);
    expect(shows(app, "Release notes")).toBe(true);

    await app.submitPrompt("summarize it");
    await app.until(() => current().harness.turns.length === 2);

    expect(app.harness.turns[1]?.text).toContain("summarize it");
    expect(app.harness.turns[1]?.text).toContain("Ship v2 on Friday");
  });

  it("ignores a note without an id", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "explain the build", "It uses Vite.");
    const before = tabIds(app);

    await app.drive(() => {
      window.dispatchEvent(
        new CustomEvent("molfar:add-note-to-chat", { detail: { ...note, id: "" } }),
      );
    });
    await app.settle(100);

    expect(tabIds(app)).toEqual(before);
  });
});
