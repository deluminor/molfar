import { describe, expect, it, vi } from "vitest";
import type { CiRepairRequest } from "@/features/inbox/model/ci-repair";
import { testSession } from "@/integrations/harness/core/test-session";
import { repairChecks } from "./ci-repair";
import { issue, setupInbox } from "./inbox.fixture";

const tracked = vi.hoisted(() => ({ run: [] as Array<() => void> }));

vi.mock("@/features/inbox/model/ci-repair-tracking", () => ({
  trackCiRepair: (_cwd: string, _request: unknown, _id: string, start: (settle: () => void) => void) =>
    tracked.run.push(() => start(() => undefined)),
}));

const request = { text: "Fix the failing checks" } as CiRepairRequest;

describe("repairChecks", () => {
  it("starts a linked repair chat and asks it to fix the checks", async () => {
    const { deps, sessions } = setupInbox([]);

    await repairChecks(deps, { ...issue, kind: "pr" }, request);
    tracked.run.at(-1)?.();

    const repair = sessions()[0];
    expect(repair.title).toBe("Fix CI #42: Login fails");
    expect(deps.submit).toHaveBeenCalledWith(
      repair.id,
      "Fix the failing checks",
      [],
      expect.objectContaining({ ciRepair: request }),
    );
    expect(deps.selectHistorySession).toHaveBeenCalledWith(repair.id);
  });

  it("refuses a busy chat and a chat from another project", async () => {
    const busy = setupInbox([{ ...testSession("claude", "/work/demo"), id: "b", busy: true }]);
    const other = setupInbox([{ ...testSession("claude", "/work/other"), id: "o" }]);

    await expect(repairChecks(busy.deps, issue, request, "b")).rejects.toThrow("This chat is busy");
    await expect(repairChecks(other.deps, issue, request, "o")).rejects.toThrow(
      "Choose a chat from this project.",
    );
  });

  it("needs a local project", async () => {
    const { deps } = setupInbox();

    await expect(repairChecks(deps, { ...issue, projectPath: "" }, request)).rejects.toThrow(
      "Choose a local project",
    );
  });
});
