// @vitest-environment happy-dom
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppHarness, renderApp } from "./testing/app-harness";
import {
  answerDialog,
  callsSince,
  dialogText,
  markedInterrupted,
  persistOrder,
  startTurn,
  upsertedSessions,
} from "./testing/lifecycle-steps";
import { answeredSession } from "./testing/workspace-steps";

// Pins the coordinated quit, the background saves and the unsaved-files
// reload prompt before the lifecycle effects leave App.tsx (global refactor,
// Session 16).

vi.setConfig({ testTimeout: 60_000 });

let app: AppHarness | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.unmount();
  app = undefined;
});

function current(): AppHarness {
  if (!app) throw new Error("App not rendered");
  return app;
}

const lifecycle = () => import("../model/app-lifecycle");

const NOTES_FILE = { name: "notes.md", path: "/work/demo/notes.md", relative: "notes.md" };
const FILE_ROUTES = {
  list_project_files: () => [NOTES_FILE],
  read_text_file: () => "hello\n",
};

async function openNotesFile(app: AppHarness): Promise<void> {
  await app.emit("go_to_file");
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Go to File"]');
  if (!input) throw new Error("Go to File did not open");
  await app.submitInput(input, "notes");
  await app.until(() => !!document.querySelector(".cm-content"));
}

async function editOpenFile(app: AppHarness): Promise<void> {
  const content = document.querySelector<HTMLElement>(".cm-content");
  const view = content ? EditorView.findFromDOM(content) : null;
  if (!view) throw new Error("No editor on screen");
  await app.drive(() => view.dispatch({ changes: { from: 0, insert: "edited " } }));
}

describe("Workspace coordinated quit", () => {
  it("saves the chats with running turns interrupted, the layout and the in-flight list, then reports ready", async () => {
    app = await renderApp({ project: "/work/demo" });
    await startTurn(app, "keep going");
    await app.settle(500);
    const mark = app.calls.length;

    const { commitQuit } = await lifecycle();
    await app.drive(() => void commitQuit(7));
    await app.until(() => callsSince(current(), mark, "quit_ready").length > 0);

    expect(persistOrder(app, mark, "quit_ready")).toEqual([
      "session_upsert",
      "workspace_set_snapshot",
      "session_set_in_flight",
      "quit_ready",
    ]);
    expect(upsertedSessions(app, mark).some(markedInterrupted)).toBe(true);
    expect(callsSince(app, mark, "quit_ready")[0]?.args).toEqual({ id: 7, persisted: true });
  });

  it("sends no debounced chat write after reporting ready", async () => {
    app = await renderApp({ project: "/work/demo" });
    await answeredSession(app, "hello", "world reply");
    const mark = app.calls.length;

    const { commitQuit } = await lifecycle();
    await app.drive(() => void commitQuit(5));
    await app.until(() => callsSince(current(), mark, "quit_ready").length > 0);
    await app.settle(1000);

    const after = app.calls.slice(mark);
    const ready = after.findIndex((call) => call.command === "quit_ready");
    expect(after.slice(ready + 1).filter((call) => call.command === "session_upsert")).toEqual([]);
    expect(JSON.stringify(upsertedSessions(app, mark).at(-1))).toContain("world reply");
  });

  it("reports the window's running turns when the coordinator polls", async () => {
    app = await renderApp({ project: "/work/demo" });
    await startTurn(app, "keep going");

    const { reportQuitPoll } = await lifecycle();
    await app.drive(() => void reportQuitPoll(3));
    await app.until(() => current().commands("quit_poll_reply").length === 1);

    expect(app.commands("quit_poll_reply")[0]?.args).toEqual({ id: 3, inFlight: 1 });
  });

  it("calls the quit off when saving the layout fails", async () => {
    app = await renderApp({
      project: "/work/demo",
      routes: {
        workspace_set_snapshot: () => {
          throw new Error("disk full");
        },
      },
    });
    await answeredSession(app, "hello", "world reply");

    const { commitQuit, isAppQuitting } = await lifecycle();
    await app.drive(() => void commitQuit(9));
    await app.until(() => current().commands("quit_ready").length === 1);

    expect(app.commands("quit_ready")[0]?.args).toEqual({ id: 9, persisted: false });
    expect(isAppQuitting()).toBe(false);
  });
});

describe("Workspace background saves", () => {
  it("saves a chat after its turn and records it in flight only while it runs", async () => {
    app = await renderApp({ project: "/work/demo" });
    const mark = app.calls.length;

    await answeredSession(app, "hello", "world reply");
    await app.settle(800);

    const inFlight = callsSince(app, mark, "session_set_in_flight").map(
      (call) => (call.args as { sessions: unknown[] }).sessions.length,
    );
    expect(inFlight).toEqual([1, 0]);
    const saved = upsertedSessions(app, mark);
    expect(saved.length).toBeGreaterThan(0);
    expect(JSON.stringify(saved[saved.length - 1])).toContain("world reply");

    const idle = app.calls.length;
    await app.settle(1000);
    expect(persistOrder(app, idle)).toEqual([]);
  });

  it("saves the layout once after a file opens", async () => {
    app = await renderApp({ project: "/work/demo", routes: FILE_ROUTES });
    const mark = app.calls.length;

    await openNotesFile(app);
    await app.settle(600);

    const saves = callsSince(app, mark, "workspace_set_snapshot");
    expect(saves).toHaveLength(1);
    expect(JSON.stringify(saves[0]?.args)).toContain(NOTES_FILE.path);
  });
});

describe("Workspace reload prompt", () => {
  it("reloads at once with no unsaved files", async () => {
    app = await renderApp({ project: "/work/demo" });
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});

    await app.emit("reload");
    await app.settle(200);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(dialogText()).toBeUndefined();
  });

  it("asks before discarding unsaved files, and Cancel keeps the window", async () => {
    app = await renderApp({ project: "/work/demo", routes: FILE_ROUTES });
    await openNotesFile(app);
    await editOpenFile(app);
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});

    await app.emit("reload");
    await app.until(() => !!dialogText()?.includes("discard unsaved changes"));
    await answerDialog(app, "Cancel");
    expect(reload).not.toHaveBeenCalled();

    await app.emit("reload");
    await answerDialog(app, "Reload");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
