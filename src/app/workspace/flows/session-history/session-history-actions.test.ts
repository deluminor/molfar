// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { leaf, newTab, splitPane, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { confirmApp } from "@/shared/lib/app-dialog";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { resetFamiliar } from "../familiars/familiar-removal";
import { removeSession } from "../session-removal/remove-session";
import { pinSession } from "./session-actions";
import { createSessionHistoryActions } from "./session-history-actions";
import type { SessionHistoryDeps } from "./session-history-deps";

vi.mock("../session-removal/remove-session", () => ({ removeSession: vi.fn(async () => true) }));
vi.mock("./session-actions", () => ({ pinSession: vi.fn(async () => undefined), renameSession: vi.fn() }));
vi.mock("../familiars/familiar-removal", () => ({ resetFamiliar: vi.fn(), deleteFamiliar: vi.fn() }));
vi.mock("@/shared/lib/app-dialog", () => ({ alertApp: vi.fn(async () => undefined), confirmApp: vi.fn() }));

const session = (id: string): Session => ({ ...testSession("claude", "/work/demo"), id });

function setup(tabs: WorkspaceTab[] = [], sessions: Session[] = []) {
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions,
      history: [{ id: "a", archived: true } as never],
    }),
  );
  const removal = {
    store,
    sessionsRef: { current: sessions },
    tabsRef: { current: tabs },
    removingSessionIds: { current: new Set<string>() },
  };
  const deps = {
    session: {},
    removal,
    link: {},
    familiarRemoval: {},
    setSessionArchived: vi.fn(async () => undefined),
    archiveContext: vi.fn(),
  } as unknown as SessionHistoryDeps;
  return { deps, store, actions: createSessionHistoryActions(deps) };
}

describe("createSessionHistoryActions", () => {
  beforeEach(() => vi.mocked(removeSession).mockReset().mockResolvedValue(true));

  it("unarchives through the store and marks the history entry", async () => {
    const { deps, store, actions } = setup();

    expect(await actions.archive("a", false)).toBe(true);

    expect(deps.setSessionArchived).toHaveBeenCalledWith("a", false);
    expect(store.getState().history[0]).toMatchObject({ archived: false });
    expect(removeSession).not.toHaveBeenCalled();
  });

  it("does not unarchive a session being removed, and reports a refused unarchive", async () => {
    const { deps, actions } = setup();
    deps.removal.removingSessionIds.current.add("a");
    expect(await actions.archive("a", false)).toBe(false);

    deps.removal.removingSessionIds.current.clear();
    vi.mocked(deps.setSessionArchived).mockRejectedValueOnce(new Error("locked"));
    expect(await actions.archive("a", false)).toBe(false);
  });

  it("stops a bulk archive at the first session that fails", async () => {
    const { actions } = setup();
    vi.mocked(removeSession).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await actions.archiveMany(["a", "b", "c"], true);

    expect(vi.mocked(removeSession).mock.calls.map((call) => call[1])).toEqual(["a", "b"]);
  });

  it("deletes the selected sessions only after one confirmation, skipping per-session prompts", async () => {
    const { actions } = setup();
    vi.mocked(confirmApp).mockResolvedValueOnce(false);
    await actions.deleteMany(["a", "b"]);
    expect(removeSession).not.toHaveBeenCalled();

    vi.mocked(confirmApp).mockResolvedValueOnce(true);
    await actions.deleteMany(["a", "b"]);
    expect(vi.mocked(removeSession).mock.calls.map((call) => call.slice(1, 4))).toEqual([
      ["a", "delete", true],
      ["b", "delete", true],
    ]);
  });

  it("deletes a title tab's open sessions: one asks per session, several confirm once", async () => {
    const single = { ...newTab("a"), id: "t1" };
    const split = { ...single, id: "t2", layout: splitPane(leaf("a"), "a", "right", "b") };
    const { actions } = setup([single, split], [session("a"), session("b")]);

    actions.deleteTitleTab("t1");
    await vi.waitFor(() => expect(removeSession).toHaveBeenCalledTimes(1));
    expect(vi.mocked(removeSession).mock.calls[0].slice(1, 4)).toEqual(["a", "delete", false]);

    vi.mocked(confirmApp).mockResolvedValueOnce(true);
    actions.deleteTitleTab("t2");
    await vi.waitFor(() => expect(removeSession).toHaveBeenCalledTimes(3));
    actions.deleteTitleTab("missing");
    expect(removeSession).toHaveBeenCalledTimes(3);
  });

  it("archives the focused session when the shortcut owns the key", () => {
    const { deps, actions } = setup([{ ...newTab("a"), id: "t1" }], [session("a")]);
    vi.mocked(deps.archiveContext).mockReturnValue({
      activeTabId: "t1",
      tabs: deps.removal.tabsRef.current,
      sessions: deps.removal.sessionsRef.current,
      projectTerminalFocused: false,
      surfaceOpen: false,
    });

    actions.archiveFocused(new KeyboardEvent("keydown"));

    expect(removeSession).toHaveBeenCalledWith(deps.removal, "a", "archive", false, "ui");
  });

  it("pins every selected session and resets a Familiar over the bound remover", async () => {
    const { deps, actions } = setup();

    await actions.pinMany(["a", "b"], true);
    expect(pinSession).toHaveBeenCalledTimes(2);

    actions.resetFamiliar("f");
    const familiarDeps = vi.mocked(resetFamiliar).mock.calls[0][0];
    await familiarDeps.removeSession("s", "delete", true);
    expect(removeSession).toHaveBeenCalledWith(deps.removal, "s", "delete", true, "ui");
  });
});
