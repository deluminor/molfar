// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { useApprovalToastsView } from "./use-approval-toasts-view";

const mocks = vi.hoisted(() => ({ notices: vi.fn(() => []) }));

vi.mock("@/features/notifications/model/approval-toast", () => ({
  hiddenApprovalNotices: mocks.notices,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const chats = [{ id: "a" }, { id: "fam" }] as Session[];

function render(familiarViewId: string | null) {
  function Probe() {
    useApprovalToastsView({ promptableSessions: chats, activeTabId: "t", tabs: [], composerFocused: true, familiarViewId });
    return null;
  }
  act(() => createRoot(document.createElement("div")).render(createElement(Probe)));
}

describe("useApprovalToastsView", () => {
  it("passes every chat and the active tab when no Familiar covers the workspace", () => {
    render(null);
    expect(mocks.notices).toHaveBeenLastCalledWith(chats, "t", [], true);
  });

  it("drops the covering Familiar's chat and treats no tab as visible", () => {
    render("fam");
    expect(mocks.notices).toHaveBeenLastCalledWith([chats[0]], "", [], true);
  });
});
