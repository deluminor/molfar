import { describe, expect, it, vi } from "vitest";
import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { leafIds, newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { OpenBesideDeps } from "../tabs/open-session-beside";
import { createSecondOpinionActions } from "./second-opinion-actions";

const turn: Block[] = [
  { id: "ask", role: "user", text: "Fix the build" },
  { id: "reply", role: "assistant", text: "Fixed" },
];

function setup(source: Partial<Session> = {}, tabs: WorkspaceTab[] = [{ ...newTab("src"), id: "t1" }]) {
  const sessions: Session[] = [
    {
      ...testSession("claude", "/work/demo"),
      id: "src",
      worktreeCwd: "/work/demo-wt",
      branch: "fix/build",
      blocks: turn,
      ...source,
    },
  ];
  const store = createWorkspaceStore(testWorkspaceState({ sessions, tabs, projectTerminalFocused: true }));
  const beside = {
    store,
    sessionsRef: { current: sessions },
    tabsRef: { current: tabs },
    activeTabIdRef: { current: "other" },
    setSessions: vi.fn(),
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
    appendTab: vi.fn(),
  } satisfies OpenBesideDeps;
  const submit = vi.fn(() => true);
  return { beside, store, submit, actions: createSecondOpinionActions({ beside, submit }) };
}

const added = (beside: OpenBesideDeps) => beside.sessionsRef.current[1];

describe("createSecondOpinionActions", () => {
  it("asks another model beside the source in its working copy and sends the review request", () => {
    const { beside, store, submit, actions } = setup();

    actions.secondOpinion("src", { harness: "codex", model: "" }, turn);

    const session = added(beside);
    expect(session).toMatchObject({ harness: "codex", cwd: "/work/demo", worktreeCwd: "/work/demo-wt", branch: "fix/build" });
    expect(beside.setSessions).toHaveBeenCalledWith(beside.sessionsRef.current);
    const tab = store.getState().tabs[0];
    expect(leafIds(tab.layout)).toEqual(["src", session.id]);
    expect(tab.focusedId).toBe(session.id);
    expect(beside.selectTab).toHaveBeenCalledWith("t1");
    expect(store.getState().projectTerminalFocused).toBe(false);
    expect(beside.setComposerFocused).toHaveBeenCalledWith(false);
    expect(submit).toHaveBeenCalledWith(session.id, expect.stringContaining("Fix the build"), [], expect.anything());
  });

  it("hands off in a new tab when no tab holds the source, focusing its composer", () => {
    const { beside, submit, actions } = setup({}, []);

    actions.handoff("src", { harness: "codex", model: "" }, turn);

    const session = added(beside);
    expect(session.handoffCard).toMatchObject({ from: "claude", to: "codex" });
    expect(beside.appendTab).toHaveBeenCalledWith(expect.objectContaining({ focusedId: session.id }), "/work/demo");
    expect(beside.selectTab).toHaveBeenCalledWith(beside.appendTab.mock.calls[0][0].id);
    expect(beside.setComposerFocused).toHaveBeenCalledWith(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps the active tab when the source is already in it", () => {
    const { beside, actions } = setup();
    beside.activeTabIdRef.current = "t1";

    actions.handoff("src", { harness: "codex", model: "" }, turn);

    expect(beside.selectTab).not.toHaveBeenCalled();
  });

  it("ignores a missing source or one whose worktree is gone", () => {
    const { beside, submit, actions } = setup({ worktreeRemoved: true });

    actions.secondOpinion("src", { harness: "codex", model: "" }, turn);
    actions.handoff("missing", { harness: "codex", model: "" }, turn);

    expect(beside.sessionsRef.current).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
