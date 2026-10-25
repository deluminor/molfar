import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceViewProps } from "./types";
import { shownSessionState } from "./workspace-view-parts";

const chat = (id: string) => ({ id }) as Session;

function props(shownId: string | null, focused: boolean, pending: boolean): WorkspaceViewProps {
  return {
    core: { sessions: [chat("a"), chat("b")], shownFamiliarSessionId: shownId, familiarShownSessionFocused: focused },
    view: { active: chat("a"), workspaceNavigation: { pending } },
  } as unknown as WorkspaceViewProps;
}

describe("shownSessionState", () => {
  it("marks the active chat as switching only while a workspace switch is pending", () => {
    expect(shownSessionState(props(null, false, true)).workspaceSwitchingSessionId).toBe("a");
    expect(shownSessionState(props(null, false, false)).workspaceSwitchingSessionId).toBeUndefined();
  });

  it("finds the chat a Familiar shows and makes it active only when it has focus", () => {
    expect(shownSessionState(props("b", true, false))).toMatchObject({
      familiarShownSessionPane: chat("b"),
      familiarShownSessionActive: true,
    });
    expect(shownSessionState(props("b", false, false)).familiarShownSessionActive).toBe(false);
    expect(shownSessionState(props("gone", true, false))).toMatchObject({
      familiarShownSessionPane: undefined,
      familiarShownSessionActive: false,
    });
  });
});
