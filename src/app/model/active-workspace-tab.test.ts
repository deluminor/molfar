import { describe, expect, it } from "vitest";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { activeWorkspaceTab } from "./active-workspace-tab";

const other = { ...testSession("claude", "/work/other"), id: "o" };
const demo = { ...testSession("claude", "/work/demo"), id: "d" };
const tabs = [
  { ...newTab("o"), id: "t-other" },
  { ...newTab("d"), id: "t-demo" },
];

describe("activeWorkspaceTab", () => {
  it("returns the active tab", () => {
    expect(activeWorkspaceTab(tabs, "t-other", [other, demo], "/work/demo")?.id).toBe("t-other");
  });

  it("falls back within the project for a stale id", () => {
    expect(activeWorkspaceTab(tabs, "gone", [other, demo], "/work/demo")?.id).toBe("t-demo");
  });

  it("falls back to the first tab when the project has none", () => {
    expect(activeWorkspaceTab(tabs, "gone", [other, demo], "/work/none")?.id).toBe("t-other");
  });
});
