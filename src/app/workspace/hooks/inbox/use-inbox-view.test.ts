// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { useInboxView } from "./use-inbox-view";

const mocks = vi.hoisted(() => ({ related: vi.fn(() => []), repair: vi.fn(() => []) }));

vi.mock("../../flows/inbox/inbox-related-sessions", () => ({ inboxRelatedSessions: mocks.related }));
vi.mock("@/features/inbox/model/ci-repair-sessions", () => ({ ciRepairSessions: mocks.repair }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

describe("useInboxView", () => {
  it("derives the related and repair chats once per input change", () => {
    const stored = [{ id: "s" }] as SessionSummary[];
    const history = [{ id: "h" }] as SessionSummary[];
    let sessions: Session[] = [];
    function Probe() {
      useInboxView(stored, history, sessions);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));
    act(() => root.render(createElement(Probe)));
    sessions = [];
    act(() => root.render(createElement(Probe)));

    expect(mocks.related.mock.calls).toEqual([
      [stored, history, []],
      [stored, history, []],
    ]);
    expect(mocks.repair).toHaveBeenCalledTimes(2);
  });
});
