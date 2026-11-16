// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { leaf, type WorkspaceTab } from "@/features/workspace/model/layout";
import { type MountedHook, mountHook } from "../../testing/mount-hook";
import { useWorkspaceCore } from "./use-workspace-core";
import { useWorkspacePins } from "./use-workspace-pins";

vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => null, transformCallback: () => 0 }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));

let mounted: MountedHook<unknown> | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function mount<T>(hook: () => T): MountedHook<T> {
  const result = mountHook(hook);
  mounted = result;
  return result;
}

const tab = (id: string, sessionId: string) =>
  ({ kind: "session", id, layout: leaf(sessionId), focusedId: sessionId, editorPanes: [], terminalPanes: [] }) as WorkspaceTab;
const chat = (id: string, cwd: string, worktreeCwd?: string) => ({ id, cwd, worktreeCwd }) as Session;

describe("useWorkspaceCore", () => {
  it("keeps the store, its setters and the refs across renders", () => {
    const hook = mount(() => useWorkspaceCore({}));
    const first = hook.result.current;
    hook.rerender();
    const next = hook.result.current;

    expect(next?.workspaceStore).toBe(first?.workspaceStore);
    expect(next?.setTabs).toBe(first?.setTabs);
    expect(next?.setSessions).toBe(first?.setSessions);
    expect(next?.tabsRef).toBe(first?.tabsRef);
    expect(next?.turnGen).toBe(first?.turnGen);
    expect(next?.editedResends).toBe(first?.editedResends);
    expect(next?.transcriptPool).toBe(first?.transcriptPool);
    expect(first?.composerFocused).toBe(false);
  });

  it("mirrors the store's tabs, active tab and project into the refs on the next render", () => {
    const hook = mount(() => useWorkspaceCore({}));
    const store = hook.result.current?.workspaceStore;
    const tabs = [tab("t1", "s1")];

    act(() => {
      store?.getState().setTabs(tabs);
      store?.getState().setActiveTabId("t1");
      store?.getState().setProjectCwd("/work/demo");
    });
    const core = hook.result.current;

    expect(core?.tabs).toBe(tabs);
    expect(core?.tabsRef.current).toBe(tabs);
    expect(core?.activeTabIdRef.current).toBe("t1");
    expect(core?.projectCwdRef.current).toBe("/work/demo");
  });
});

describe("useWorkspacePins", () => {
  it("pins restored local tabs to their project and keeps tabs of the default workspace", () => {
    const sessions = [chat("s1", "/p"), chat("s2", "/p", "/p-wt")];
    const tabs = [tab("t1", "s1"), tab("t2", "s2")];
    const hook = mount(() => useWorkspacePins(tabs, sessions, { current: sessions }));
    const pins = hook.result.current;

    expect([...(pins?.workspacePins.current ?? [])]).toEqual([["t1", "/p"], ["t2", "/p"]]);
    expect(pins?.keepWorkspaceTab(tab("t2", "s2"))).toBe(true);
    expect(pins?.tabWorkspace(tab("t3", "s2"), sessions)).toBe("/p-wt");
    expect(pins?.keepWorkspaceTab(tab("t3", "s2"))).toBe(false);
  });

  it("lets a pinned pane decide an unpinned tab's workspace", () => {
    const sessions = [chat("s1", "/p", "/p-wt")];
    const hook = mount(() => useWorkspacePins([], sessions, { current: sessions }));
    hook.result.current?.workspacePins.current.set("s1", "/p");

    expect(hook.result.current?.tabWorkspace(tab("t9", "s1"), sessions)).toBe("/p");
  });
});
