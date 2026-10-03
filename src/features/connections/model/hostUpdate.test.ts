import { describe, expect, it } from "vitest";
import { hostUpdateReason } from "./hostUpdate";

const CURRENT = ["sessions", "workspace.run", "git.worktreeCreate", "host.vatra"];

describe("hostUpdateReason", () => {
  it("accepts a current Vatra host", () => {
    expect(hostUpdateReason({ capabilities: CURRENT })).toBeNull();
  });

  it("offers the migration for a MonoCode-era host", () => {
    expect(
      hostUpdateReason({ capabilities: CURRENT.filter((name) => name !== "host.vatra") }),
    ).toBe("update to move this MonoCode host to Vatra Host");
  });

  it("prefers the missing-feature reason for very old hosts", () => {
    expect(hostUpdateReason({ capabilities: ["sessions"] })).toBe(
      "host update needed for Explorer and Changes",
    );
  });

  it("treats a host without a capability list as outdated", () => {
    expect(hostUpdateReason({})).toBe("host update needed for Explorer and Changes");
  });
});
