// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { leafIds } from "@/features/workspace/model/layout";
import { clearTabSession } from "./tab-clear";
import {
  file,
  session,
  sessionTab,
  settle,
  setupTabClose,
  tabWithFiles,
} from "./tab-close.fixture";

describe("clearTabSession", () => {
  it("saves the conversation and starts the tab over on a blank session", () => {
    const { deps, store } = setupTabClose([session("a")], [sessionTab("t1", "a")]);

    clearTabSession(deps, "t1");

    const [old, blank] = store.getState().sessions;
    expect(deps.persist).toHaveBeenCalledWith(old);
    expect(blank).toMatchObject({ cwd: "/work/demo", harness: "claude", blocks: [] });
    expect(leafIds(store.getState().tabs[0]?.layout ?? { type: "leaf", id: "" })).toEqual([blank?.id]);
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("keeps the blank session in the tab's worktree", () => {
    const { deps, store } = setupTabClose([session("a")], [sessionTab("t1", "a")]);
    deps.tabWorkspace = () => "/work/demo-wt";

    clearTabSession(deps, "t1");

    expect(store.getState().sessions[1]).toMatchObject({ worktreeCwd: "/work/demo-wt" });
  });

  it("leaves a blank tab alone", () => {
    const blank = { ...session("a"), blocks: [] };
    const { deps, store } = setupTabClose([blank], [sessionTab("t1", "a")]);

    clearTabSession(deps, "t1");

    expect(store.getState().sessions).toEqual([blank]);
  });

  it("asks about unsaved files unless the caller confirmed", async () => {
    const tabs = [tabWithFiles("t1", "a", [file("f1")])];
    const declined = setupTabClose([session("a")], tabs, { dirty: ["f1"], confirm: false });

    clearTabSession(declined.deps, "t1");
    await settle();
    expect(declined.store.getState().sessions).toHaveLength(1);

    const confirmed = setupTabClose([session("a")], tabs, { dirty: ["f1"], confirm: false });
    clearTabSession(confirmed.deps, "t1", { confirmed: true });
    expect(confirmed.confirm).not.toHaveBeenCalled();
    expect(confirmed.store.getState().sessions).toHaveLength(2);
  });
});
