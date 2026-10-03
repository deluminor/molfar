import { describe, expect, it } from "vitest";
import { hostUpdateReason } from "./hostUpdate";

describe("hostUpdateReason", () => {
  it("accepts a host with Explorer and Changes support", () => {
    expect(
      hostUpdateReason({ capabilities: ["sessions", "workspace.run", "git.worktreeCreate"] }),
    ).toBeNull();
  });

  it("asks very old hosts to update", () => {
    expect(hostUpdateReason({ capabilities: ["sessions"] })).toBe(
      "host update needed for Explorer and Changes",
    );
  });

  it("treats a host without a capability list as outdated", () => {
    expect(hostUpdateReason({})).toBe("host update needed for Explorer and Changes");
  });
});
