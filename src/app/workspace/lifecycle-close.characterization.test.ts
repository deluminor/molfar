// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "@/features/workspace/model/workspace-snapshot";
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

// Pins what closing and reloading a window persist, and in which order,
// before the lifecycle effects leave App.tsx (global refactor, Session 16).
// Pinned to Windows, the only platform with a tray, so close to tray is on
// unless a test turns it off. happy-dom derives the platform from the host,
// so an unpinned run takes the Linux branch on Linux CI.

vi.setConfig({ testTimeout: 60_000 });

const TRAY_OFF = { "molfar.closeToTray": "0" };

let app: AppHarness | undefined;

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
});

afterEach(async () => {
  await app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

function current(): AppHarness {
  if (!app) throw new Error("App not rendered");
  return app;
}

async function idleChat(storage?: Record<string, string>): Promise<AppHarness> {
  app = await renderApp({ project: "/work/demo", storage });
  await answeredSession(app, "hello", "world reply");
  await app.settle(800);
  return app;
}

async function runningChat(storage?: Record<string, string>): Promise<AppHarness> {
  app = await renderApp({ project: "/work/demo", storage });
  await startTurn(app, "keep going");
  await app.settle(800);
  return app;
}

describe("Workspace window close", () => {
  it("saves each chat, then the layout, then hides an idle window to the tray", async () => {
    const app = await idleChat();
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "hide_window").length > 0);

    expect(persistOrder(app, mark, "hide_window")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "hide_window",
    ]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(false);
    const [save] = callsSince(app, mark, "workspace_set_snapshot");
    expect(JSON.stringify(save?.args)).toContain("/work/demo");
  });

  it("destroys the window instead when close to tray is off", async () => {
    const app = await idleChat(TRAY_OFF);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "destroy_window").length > 0);

    expect(persistOrder(app, mark, "destroy_window")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "destroy_window",
    ]);
  });

  it("hides a window with a running chat once its transcript is saved, keeping the turn", async () => {
    const app = await runningChat();
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => callsSince(app, mark, "hide_window").length > 0);

    expect(persistOrder(app, mark)).toEqual(["session_upsert", "hide_window"]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(false);
  });

  it("asks before closing a window with a running chat when close to tray is off", async () => {
    const app = await runningChat(TRAY_OFF);
    const mark = app.calls.length;

    await requestWindowClose(app);
    await app.until(() => !!dialogText()?.includes("stop its running chats"));
    await answerDialog(app, "Cancel");
    await app.settle(200);

    expect(persistOrder(app, mark)).toEqual([]);

    const confirmed = app.calls.length;
    await requestWindowClose(app);
    await answerDialog(app, "Close window");
    await app.until(() => callsSince(app, confirmed, "destroy_window").length > 0);

    expect(persistOrder(app, confirmed, "destroy_window")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "session_set_in_flight",
      "destroy_window",
    ]);
    expect(upsertedSessions(app, confirmed).some(markedInterrupted)).toBe(true);
  });
});

describe("Workspace reload (page unload)", () => {
  it("saves each chat and the layout, then stops the window's processes", async () => {
    const app = await idleChat();
    const mark = app.calls.length;

    await app.drive(() => window.dispatchEvent(new Event("beforeunload")));
    await app.until(() => callsSince(app, mark, "harness_kill_all").length > 0);

    expect(persistOrder(app, mark, "harness_kill_all")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "harness_kill_all",
    ]);
  });

  it("marks a running turn interrupted and records it in flight before stopping", async () => {
    const app = await runningChat();
    const mark = app.calls.length;

    await app.drive(() => window.dispatchEvent(new Event("pagehide")));
    await app.until(() => callsSince(app, mark, "harness_kill_all").length > 0);

    expect(persistOrder(app, mark, "harness_kill_all")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "session_set_in_flight",
      "harness_kill_all",
    ]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(true);
    const [inFlight] = callsSince(app, mark, "session_set_in_flight");
    expect(inFlight?.args?.sessions).toHaveLength(1);
  });

  it("leaves persistence to a coordinated quit already under way", async () => {
    const app = await idleChat();
    const lifecycle = await import("../model/app-lifecycle");
    await app.drive(() => void lifecycle.commitQuit(7));
    await app.until(() => app.commands("quit_ready").length > 0);
    const mark = app.calls.length;

    await app.drive(() => window.dispatchEvent(new Event("beforeunload")));
    await app.settle(300);

    expect(callsSince(current(), mark, "workspace_set_snapshot")).toEqual([]);
    expect(callsSince(current(), mark, "harness_kill_all")).toEqual([]);
  });

  it("saves the open project, its active tab and the chat the project returns to", async () => {
    const app = await idleChat();
    const mark = app.calls.length;

    await app.drive(() => window.dispatchEvent(new Event("beforeunload")));
    await app.until(() => callsSince(app, mark, "harness_kill_all").length > 0);

    const [save] = callsSince(app, mark, "workspace_set_snapshot");
    const snapshot = (save?.args as { snapshot: WorkspaceSnapshot } | undefined)?.snapshot;
    expect(snapshot?.projectCwd).toBe("/work/demo");
    expect(snapshot?.tabs.map((tab) => tab.id)).toContain(snapshot?.activeTabId);
    const active = snapshot?.tabs.find((tab) => tab.id === snapshot.activeTabId);
    expect(snapshot?.projectReturnTargets).toEqual([
      { projectPath: "/work/demo", tabId: active?.focusedId },
    ]);
  });

  it("stops listening once the workspace is gone", async () => {
    await idleChat();
    await current().unmount();
    app = undefined;
    const calls: string[] = [];
    mockIPC((command) => {
      calls.push(command);
      return null;
    });

    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    clearMocks();

    expect(calls).toEqual([]);
  });
});
