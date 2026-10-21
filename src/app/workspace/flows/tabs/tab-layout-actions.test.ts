import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { activateTab, type TabFocusDeps } from "./tab-focus";
import { appendTab, insertBeside, insertBesideActive, openSessionTab, type TabLayoutDeps } from "./tab-layout";
import { createTabLayoutActions } from "./tab-layout-actions";

vi.mock("./tab-focus", () => ({ activateTab: vi.fn() }));
vi.mock("./tab-layout", () => ({
  appendTab: vi.fn(),
  insertBeside: vi.fn(() => []),
  insertBesideActive: vi.fn(() => []),
  openSessionTab: vi.fn(() => ({ id: "t" })),
}));

beforeEach(() => vi.clearAllMocks());

const focus = {} as TabFocusDeps;
const layout = {} as TabLayoutDeps;
const tab = { id: "t" } as WorkspaceTab;

describe("createTabLayoutActions", () => {
  it("activates through the focus deps, keeping pane and reason", () => {
    createTabLayoutActions({ focus, layout }).activate("t", "p", "workspace");

    expect(activateTab).toHaveBeenCalledWith(focus, "t", "p", "workspace");
  });

  it("places tabs through the layout deps", () => {
    const actions = createTabLayoutActions({ focus, layout });
    const session = { id: "s" } as Session;

    actions.insertBeside([], tab, "a", "/w");
    actions.insertBesideActive([], tab, "/w");
    actions.append(tab, "/w");

    expect(insertBeside).toHaveBeenCalledWith(layout, [], tab, "a", "/w");
    expect(insertBesideActive).toHaveBeenCalledWith(layout, [], tab, "/w");
    expect(appendTab).toHaveBeenCalledWith(layout, tab, "/w");
    expect(actions.openSessionTab(session, "/w")).toEqual({ id: "t" });
    expect(openSessionTab).toHaveBeenCalledWith(layout, session, "/w");
  });
});
