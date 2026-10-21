// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createTerminalActions } from "./terminal-actions";
import { settle, setupTerminals } from "./terminal.fixture";

describe("createTerminalActions", () => {
  it("opens new dock terminals in the terminal folder and moves the dock", () => {
    const { deps, store, dock } = setupTerminals();
    const terminals = createTerminalActions(deps);

    terminals.openNew();
    terminals.setDockSide("left");
    terminals.setDockSize(320);

    expect(dock()?.pane.files[0]).toMatchObject({ cwd: "/work/demo/src", terminal: true });
    expect(dock()).toMatchObject({ side: "left", size: 320 });
    expect(store.getState().lastDockSide).toBe("left");
  });

  it("selects, reorders and closes the other dock terminals", async () => {
    const { deps, dock } = setupTerminals();
    const terminals = createTerminalActions(deps);
    terminals.open("/work/demo/a");
    terminals.open("/work/demo/b");
    const [first, second] = dock()?.pane.files.map((file) => file.id) ?? [];

    terminals.select(first ?? "");
    terminals.reorder([second ?? "", first ?? ""]);
    expect(dock()?.pane.files.map((file) => file.id)).toEqual([second, first]);

    terminals.closeOthers(first ?? "");
    await settle();
    expect(dock()?.pane.files.map((file) => file.id)).toEqual([first]);
  });

  it("toggles and hides the dock", () => {
    const { deps, dock } = setupTerminals();
    const terminals = createTerminalActions(deps);

    terminals.toggleDock();
    expect(dock()?.open).toBe(true);
    terminals.hideDock();
    expect(dock()?.open).toBe(false);
    expect(terminals.focusedDockTerminal()).toBeNull();
  });

  it("paints the project's dock unless a Familiar covers the workspace", () => {
    const { deps, store, dock } = setupTerminals();
    const terminals = createTerminalActions(deps);
    terminals.openNew();

    expect(terminals.dockPaintTarget()).toBe(dock());
    store.getState().setFamiliarViewId("familiar-chat");
    expect(terminals.dockPaintTarget()).toBeUndefined();
  });
});
