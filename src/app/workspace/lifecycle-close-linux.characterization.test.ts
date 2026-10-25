// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import {
  answerDialog,
  callsSince,
  dialogText,
  markedInterrupted,
  persistOrder,
  requestWindowClose,
  startTurn,
  upsertedSessions,
} from "./testing/lifecycle-steps";
import { answeredSession } from "./testing/workspace-steps";

// Pins the Linux branches of the window close: Linux installs no tray icon,
// so a stored close-to-tray choice is ignored and closing ends the window.

vi.setConfig({ testTimeout: 60_000 });

const TRAY_ON = { "molfar.closeToTray": "1" };

let rendered: AppHarness | undefined;

async function launch(): Promise<AppHarness> {
  rendered = await renderApp({ project: "/work/demo", storage: TRAY_ON });
  return rendered;
}

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
});

afterEach(async () => {
  await rendered?.unmount();
  rendered = undefined;
  vi.restoreAllMocks();
});

describe("Workspace window close on Linux", () => {
  it("saves each chat, then the layout, then destroys an idle window despite close to tray", async () => {
    const app = await launch();
    await answeredSession(app, "hello", "world reply");
    await app.settle(800);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "destroy_window").length > 0);

    expect(persistOrder(app, mark, "destroy_window")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "destroy_window",
    ]);
    expect(callsSince(app, mark, "hide_window")).toEqual([]);
  });

  it("asks before closing a window with a running chat instead of hiding it", async () => {
    const app = await launch();
    await startTurn(app, "keep going");
    await app.settle(800);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => !!dialogText()?.includes("stop its running chats"));
    await answerDialog(app, "Close window");
    await app.until(() => callsSince(app, mark, "destroy_window").length > 0);

    expect(callsSince(app, mark, "hide_window")).toEqual([]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(true);
  });
});
