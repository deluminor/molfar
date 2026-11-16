// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import {
  callsSince,
  markedInterrupted,
  persistOrder,
  requestWindowClose,
  startTurn,
  upsertedSessions,
} from "./testing/lifecycle-steps";
import { answeredSession } from "./testing/workspace-steps";

// Pins the macOS branches of the window close before they leave App.tsx
// (global refactor, Session 16): the platform is read when the app's modules
// load, which `renderApp` does after this file sets it.

vi.setConfig({ testTimeout: 60_000 });

const TRAY_OFF = { "molfar.closeToTray": "0" };

let rendered: AppHarness | undefined;

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
});

afterEach(async () => {
  await rendered?.unmount();
  rendered = undefined;
  vi.restoreAllMocks();
});

async function launch(routes?: NonNullable<Parameters<typeof renderApp>[0]>["routes"]): Promise<AppHarness> {
  rendered = await renderApp({ project: "/work/demo", storage: TRAY_OFF, routes });
  return rendered;
}

describe("Workspace window close on macOS", () => {
  it("saves the transcripts but not the layout, then hides the window while a Familiar chat stays alive", async () => {
    const app = await launch({ familiar_chat_keep_alive: () => true });
    await answeredSession(app, "hello", "world reply");
    await app.settle(800);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "hide_window").length > 0);
    await app.settle(200);

    expect(persistOrder(app, mark)).toEqual(["session_upsert", "hide_window"]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(false);
    expect(callsSince(app, mark, "familiar_chat_keep_alive")).toHaveLength(1);
  });

  it("hides a window with a running chat even when close to tray is off, after its transcript is saved", async () => {
    const app = await launch();
    await startTurn(app, "keep going");
    await app.settle(800);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "hide_window").length > 0);

    expect(persistOrder(app, mark)).toEqual(["session_upsert", "hide_window"]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(false);
  });
});
