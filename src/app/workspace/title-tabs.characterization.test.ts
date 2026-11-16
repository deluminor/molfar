// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import { answeredSession, shows, tabIds } from "./testing/workspace-steps";

// Pins the inset layout's title tabs for app views before they leave
// App.tsx (global refactor, Stage 5, surface navigation).

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

const insetApp = () =>
  renderApp({ project: "/work/demo", storage: { "molfar.insetLayout": "1" } });

describe("Workspace title tabs (inset layout)", () => {
  it("opens an app view as its own title tab and closes it back to the session", async () => {
    app = await insetApp();
    await answeredSession(app, "explain the build", "It uses Vite.");
    const sessionTabs = tabIds(app);

    await app.emit("open_search");
    await app.until(() => tabIds(current()).length === sessionTabs.length + 1);
    const searchTab = tabIds(app).find((id) => !sessionTabs.includes(id));

    await app.emit("close_tab");
    await app.until(() => !tabIds(current()).includes(searchTab ?? ""));

    expect(tabIds(app)).toEqual(sessionTabs);
  });

  it("cycles from the last view tab back to the session tab with next_tab", async () => {
    app = await insetApp();
    await answeredSession(app, "explain the build", "It uses Vite.");

    await app.emit("open_search");
    await app.emit("open_notes");
    await app.until(() => tabIds(current()).length === 3);
    await app.until(() => !shows(current(), "It uses Vite."));

    await app.emit("next_tab");
    await app.until(() => shows(current(), "It uses Vite."));
  });
});
