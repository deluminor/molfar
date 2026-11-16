// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { WorkspacePickerDialogs } from "./WorkspacePickerDialogs";

type Seen = Record<string, unknown>;

const { seen } = vi.hoisted(() => ({
  seen: { picker: undefined as Seen | undefined, dialog: undefined as Seen | undefined },
}));

vi.mock("@/features/files/ui/FilePicker", () => ({
  FilePicker: (props: Seen) => {
    seen.picker = props;
    return null;
  },
}));
vi.mock("@/features/sessions/ui/DeleteSessionDialog", () => ({
  DeleteSessionDialog: (props: Seen) => {
    seen.dialog = props;
    return null;
  },
}));

let root: Root;
let store: WorkspaceStore;
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

function mount(): void {
  act(() =>
    root.render(
      withWorkspaceHandlers(
        createElement(WorkspacePickerDialogs, { store, cwd: "/work/app" }),
        handlers,
      ),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  store = createWorkspaceStore(testWorkspaceState());
  seen.picker = undefined;
  seen.dialog = undefined;
  handlers = fakeWorkspaceHandlers();
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspacePickerDialogs", () => {
  it("opens the file picker from the store, runs reload and closes it", () => {
    mount();
    expect(seen.picker).toBeUndefined();

    act(() => store.setState({ filePickerOpen: true, filePickerInitialQuery: ">" }));
    expect(seen.picker).toMatchObject({ open: true, initialQuery: ">", cwd: "/work/app", openPaths: [] });

    const runAction = seen.picker?.onRunAction as (id: string) => void;
    const close = seen.picker?.onClose as () => void;
    runAction("other");
    runAction("reload");
    act(() => close());

    expect(handlers.navigation.reload).toHaveBeenCalledTimes(1);
    expect(seen.picker?.onOpenFile).toBe(handlers.files.open);
    expect(store.getState().filePickerOpen).toBe(false);
  });

  it("resolves the delete confirmation with the choice and clears it", () => {
    const resolve = vi.fn();
    mount();
    act(() =>
      store.setState({
        sessionDeleteDialog: { title: "Chat", unusedWorktree: undefined, resolve } as never,
      }),
    );
    expect(seen.dialog?.title).toBe("Chat");

    const close = seen.dialog?.onClose as (choice: string) => void;
    act(() => close("delete"));

    expect(resolve).toHaveBeenCalledWith("delete");
    expect(store.getState().sessionDeleteDialog).toBeUndefined();
  });
});
