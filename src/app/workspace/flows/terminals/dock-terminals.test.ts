// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  closeOtherProjectTerminals,
  closeProjectTerminal,
  focusedDockTerminal,
  hideProjectTerminal,
  openProjectTerminal,
  reorderProjectTerminals,
  selectProjectTerminal,
  setProjectTerminalSide,
  toggleProjectTerminal,
} from "./dock-terminals";
import { settle, setupTerminals } from "./terminal.fixture";

function files(dock: ReturnType<ReturnType<typeof setupTerminals>["dock"]>) {
  return dock?.pane.files.map((file) => file.id) ?? [];
}

describe("dock terminals", () => {
  it("starts the project's dock on the last side and focuses it", () => {
    const { deps, store, dock } = setupTerminals();
    store.getState().setLastDockSide("right");

    expect(openProjectTerminal(deps, "/work/demo/app")).toBe(true);

    expect(dock()).toMatchObject({ projectPath: "/work/demo", side: "right", open: true });
    expect(dock()?.pane.files[0]).toMatchObject({ cwd: "/work/demo/app", terminal: true });
    expect(store.getState().projectTerminalFocused).toBe(true);
    expect(deps.setComposerFocused).toHaveBeenCalledWith(false);
  });

  it("opens nothing outside a local project", () => {
    const { deps, dock } = setupTerminals({ projectCwd: "~" });

    expect(openProjectTerminal(deps, "")).toBe(false);
    expect(dock()).toBeUndefined();
  });

  it("toggles the dock, starting it in the terminal folder the first time", () => {
    const { deps, store, dock } = setupTerminals();

    toggleProjectTerminal(deps);
    expect(dock()?.pane.files[0]?.cwd).toBe("/work/demo/src");
    expect(deps.leaveCoveringFamiliar).toHaveBeenCalled();

    toggleProjectTerminal(deps);
    expect(dock()?.open).toBe(false);
    expect(store.getState().projectTerminalFocused).toBe(false);

    toggleProjectTerminal(deps);
    expect(dock()?.open).toBe(true);
    expect(dock()?.pane.files).toHaveLength(1);
  });

  it("hides the dock and moves its side", () => {
    const { deps, store, dock } = setupTerminals();
    openProjectTerminal(deps, "");

    setProjectTerminalSide(deps, "left");
    hideProjectTerminal(deps);

    expect(dock()).toMatchObject({ side: "left", open: false });
    expect(store.getState().lastDockSide).toBe("left");
  });

  it("selects and reorders dock terminals", () => {
    const { deps, dock } = setupTerminals();
    openProjectTerminal(deps, "");
    openProjectTerminal(deps, "");
    const [first, second] = files(dock());

    selectProjectTerminal(deps, first ?? "");
    reorderProjectTerminals(deps, [second ?? "", first ?? ""]);

    expect(dock()?.pane.activeFileId).toBe(first);
    expect(files(dock())).toEqual([second, first]);
  });

  it("closes a terminal once confirmed and keeps it when declined", async () => {
    const declined = setupTerminals({ confirm: false });
    openProjectTerminal(declined.deps, "");
    closeProjectTerminal(declined.deps, files(declined.dock())[0] ?? "");
    await settle();
    expect(files(declined.dock())).toHaveLength(1);

    const confirmed = setupTerminals();
    openProjectTerminal(confirmed.deps, "");
    openProjectTerminal(confirmed.deps, "");
    const [first, second] = files(confirmed.dock());
    closeProjectTerminal(confirmed.deps, first ?? "");
    await settle();
    expect(files(confirmed.dock())).toEqual([second]);
  });

  it("closes the other dock terminals and shows the kept one", async () => {
    const { deps, dock } = setupTerminals();
    for (let i = 0; i < 3; i += 1) openProjectTerminal(deps, "");
    const [, kept] = files(dock());

    closeOtherProjectTerminals(deps, kept ?? "");
    await settle();

    expect(files(dock())).toEqual([kept]);
    expect(dock()?.pane.activeFileId).toBe(kept);
  });

  it("finds the focused dock terminal only while the keyboard is in the dock", () => {
    const { deps, dock } = setupTerminals();
    openProjectTerminal(deps, "");
    expect(focusedDockTerminal(deps)).toBeNull();

    const section = document.createElement("section");
    section.dataset.projectTerminalDock = "";
    const input = document.createElement("textarea");
    section.append(input);
    document.body.append(section);
    input.focus();

    expect(focusedDockTerminal(deps)).toBe(dock()?.pane.activeFileId);
    section.remove();
  });
});
