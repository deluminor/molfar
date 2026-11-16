// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, type IpcRoute, renderApp } from "./testing/app-harness";
import { callsSince, startTurn, upsertedSessions } from "./testing/lifecycle-steps";
import { answeredSession, shows } from "./testing/workspace-steps";

// Pins what a window restores on boot from the previous window's saves
// before the lifecycle effects leave App.tsx (global refactor, Session 16).

vi.setConfig({ testTimeout: 60_000 });

const OPEN_FAMILIAR_KEY = "molfar:open-familiar";

let app: AppHarness | undefined;

afterEach(async () => {
  await app?.unmount();
  app = undefined;
});

function current(): AppHarness {
  if (!app) throw new Error("App not rendered");
  return app;
}

type SavedWorkspace = { routes: Record<string, IpcRoute>; sessionId: string };

/** Reloads the window and keeps what it saved, as the next boot reads it. */
async function reloadAndKeepSaves(app: AppHarness): Promise<SavedWorkspace> {
  const mark = app.calls.length;
  await app.drive(() => window.dispatchEvent(new Event("beforeunload")));
  await app.until(() => callsSince(app, mark, "harness_kill_all").length > 0);

  const snapshot = callsSince(app, mark, "workspace_set_snapshot")[0]?.args?.snapshot;
  const saved = new Map(upsertedSessions(app, 0).map((session) => [session.id, session]));
  const inFlight = callsSince(app, mark, "session_set_in_flight")[0]?.args?.sessions ?? [];
  const [sessionId = ""] = saved.keys();

  return {
    sessionId,
    routes: {
      workspace_get_snapshot: () => snapshot,
      session_list_in_flight: () => inFlight,
      session_get: (args) => saved.get(String(args?.sessionId)) ?? null,
    },
  };
}

describe("Workspace boot", () => {
  it("reopens the saved chat in its tab from the last window's layout", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "hello", "world reply");
    await app.settle(800);
    const { routes, sessionId } = await reloadAndKeepSaves(app);
    await app.unmount();

    app = await renderApp({ project: "/work/demo", boot: true, routes });
    await app.until(() => shows(current(), "world reply"));

    expect(app.commands("session_get").map((call) => call.args?.sessionId)).toContain(sessionId);
    expect(upsertedSessions(app, 0)).toEqual([]);
  });

  it("brings back a turn the reload cut off as interrupted, saving only that chat at boot", async () => {
    app = await renderApp({ project: "/work/demo" });
    await startTurn(app, "keep going");
    await app.settle(800);
    const { routes, sessionId } = await reloadAndKeepSaves(app);
    await app.unmount();

    app = await renderApp({ project: "/work/demo", boot: true, routes });
    await app.until(() => shows(current(), "Turn interrupted when MOLFAR quit."));

    expect(app.commands("session_list_in_flight")).toHaveLength(1);
    expect(upsertedSessions(app, 0).map((session) => session.id)).toEqual([sessionId]);
  });

  it("opens the home folder as the project when none was ever opened", async () => {
    app = await renderApp({ routes: { default_cwd: () => "/work/home" } });
    await app.until(() => shows(current(), "home"));

    expect(app.commands("default_cwd")).toHaveLength(1);
  });

  it("keeps the last project without asking for the home folder", async () => {
    app = await renderApp({ project: "/work/demo", routes: { default_cwd: () => "/work/home" } });

    expect(app.commands("default_cwd")).toHaveLength(0);
  });
});

describe("Workspace boot with Familiars", () => {
  function storageSnapshot(): Record<string, string> {
    const entries: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key) entries[key] = localStorage.getItem(key) ?? "";
    }
    return entries;
  }

  function overviewShownIn(host: HTMLElement): boolean {
    return [...host.querySelectorAll('[aria-label="Overview"]')].some(
      (element) => !element.closest('[aria-hidden="true"]'),
    );
  }

  const overviewShown = () => overviewShownIn(current().host);

  it("reopens the Familiar that was open when the app closed", async () => {
    app = await renderApp({ project: "/work/demo" });
    await app.click("Create familiar");
    await app.until(overviewShown);
    const storage = storageSnapshot();
    expect(storage[OPEN_FAMILIAR_KEY]).toBeTruthy();
    await app.unmount();

    app = await renderApp({ project: "/work/demo", storage, ready: overviewShownIn });

    expect(current().host.querySelectorAll("[data-title-tab-id]")).toHaveLength(0);
  });

  it("forgets a saved open Familiar that no longer exists", async () => {
    app = await renderApp({ project: "/work/demo", storage: { [OPEN_FAMILIAR_KEY]: "gone" } });
    await app.settle(200);

    expect(localStorage.getItem(OPEN_FAMILIAR_KEY)).toBeNull();
    expect(overviewShown()).toBe(false);
  });
});
