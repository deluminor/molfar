import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { LinkedWorkItemPanelState } from "../../store/surfaces-slice";
import { shownLinkedPanelSessionId } from "./shown-linked-panel";

const panels = new Map(
  ["a", "b", "c"].map((id) => [id, { sessionId: id } as LinkedWorkItemPanelState]),
);
const split = (focusedId: string) =>
  ({
    id: "t",
    focusedId,
    layout: { type: "split", children: [{ type: "leaf", id: "a" }, { type: "leaf", id: "b" }, { type: "leaf", id: "x" }] },
  }) as unknown as WorkspaceTab;

describe("shownLinkedPanelSessionId", () => {
  it("shows the focused pane's panel", () => {
    expect(shownLinkedPanelSessionId(panels, split("a"))).toBe("a");
  });

  it("falls back to the latest panel opened in the tab", () => {
    expect(shownLinkedPanelSessionId(panels, split("x"))).toBe("b");
  });

  it("shows none without an active tab or a panel in it", () => {
    expect(shownLinkedPanelSessionId(panels, undefined)).toBeUndefined();
    expect(shownLinkedPanelSessionId(new Map(), split("a"))).toBeUndefined();
  });
});
