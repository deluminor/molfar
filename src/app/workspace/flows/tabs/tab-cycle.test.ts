import { describe, expect, it } from "vitest";
import { cycleTab, tabInSlot } from "./tab-cycle";

const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("cycleTab", () => {
  it("moves to the neighbour and wraps around the ends", () => {
    expect(cycleTab(tabs, "a", 1)?.id).toBe("b");
    expect(cycleTab(tabs, "c", 1)?.id).toBe("a");
    expect(cycleTab(tabs, "a", -1)?.id).toBe("c");
  });

  it("finds nothing when the active tab is not in the list", () => {
    expect(cycleTab(tabs, "z", 1)).toBeUndefined();
  });
});

describe("tabInSlot", () => {
  it("returns the tab in a slot, the last for a negative slot", () => {
    expect(tabInSlot(tabs, 0)?.id).toBe("a");
    expect(tabInSlot(tabs, -1)?.id).toBe("c");
    expect(tabInSlot(tabs, 5)).toBeUndefined();
  });
});
