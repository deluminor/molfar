// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import {
  newTab,
  newTerminalFile,
  newTerminalWorkspaceTab,
} from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { openProjectTerminal } from "./dock-terminals";
import { setupTerminals } from "./terminal.fixture";
import {
  changeTerminalMeta,
  openTerminal,
  openTerminalInSession,
  toggleRunningTerminal,
} from "./workspace-terminals";

function session(id: string, answered = true): Session {
  return {
    ...testSession("claude", "/work/demo"),
    id,
    blocks: answered ? [{ id: `${id}-u`, role: "user", text: "hi" }] : [],
  };
}

describe("openTerminal", () => {
  it("adds the terminal to the project's dock", () => {
    const { deps, dock } = setupTerminals({ sessions: [session("a")], tabs: [newTab("a")] });

    openTerminal(deps, "");

    expect(dock()?.pane.files[0]?.cwd).toBe("/work/demo/src");
  });

  it("opens nothing for a folder outside local projects", () => {
    const { deps, dock } = setupTerminals();

    openTerminal(deps, "remote://box/work");

    expect(dock()).toBeUndefined();
  });
});

describe("openTerminalInSession", () => {
  it("skips a conversation whose worktree was removed", () => {
    const { deps, dock } = setupTerminals({
      sessions: [{ ...session("a"), worktreeRemoved: true }],
      tabs: [newTab("a")],
    });

    openTerminalInSession(deps, "a");

    expect(dock()).toBeUndefined();
  });
});

describe("changeTerminalMeta", () => {
  it("retitles the terminal in its dock", () => {
    const { deps, dock } = setupTerminals();
    openProjectTerminal(deps, "");
    const id = dock()?.pane.files[0]?.id ?? "";

    changeTerminalMeta(deps, id, { foreground: "npm" });

    expect(dock()?.pane.files[0]?.foreground).toBe("npm");
  });
});

describe("toggleRunningTerminal", () => {
  it("hides an open dock and shows a hidden one on that terminal", () => {
    const { deps, store, dock } = setupTerminals();
    openProjectTerminal(deps, "");
    openProjectTerminal(deps, "");
    const first = dock()?.pane.files[0]?.id ?? "";

    toggleRunningTerminal(deps, first);
    expect(dock()?.open).toBe(false);
    expect(store.getState().projectTerminalFocused).toBe(false);

    toggleRunningTerminal(deps, first);
    expect(dock()).toMatchObject({ open: true });
    expect(dock()?.pane.activeFileId).toBe(first);
  });

  it("brings a terminal tab forward, or hands focus back when it shows", () => {
    const file = newTerminalFile("/work/demo", undefined, "/work/demo");
    const terminalTab = newTerminalWorkspaceTab(file);
    const { deps, store } = setupTerminals({
      sessions: [session("a")],
      tabs: [newTab("a"), terminalTab],
    });

    toggleRunningTerminal(deps, file.id);
    expect(deps.selectTab).toHaveBeenCalledWith(terminalTab.id);
    expect(deps.setComposerFocused).toHaveBeenLastCalledWith(false);

    toggleRunningTerminal(deps, file.id);
    expect(store.getState().activeTabId).toBe(terminalTab.id);
    expect(deps.setComposerFocused).toHaveBeenLastCalledWith(true);
  });
});
