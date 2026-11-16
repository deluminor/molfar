import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import { setupTurnQueue } from "./turn-queue.fixture";
import { createUsageLimits } from "./usage-limits";

const transfer = vi.hoisted(() => ({ run: vi.fn<() => Promise<void>>() }));

vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  transferHarnessSessionAccount: () => transfer.run(),
}));
vi.mock("@/features/providers/model/provider-accounts", () => ({
  providerAccountExists: () => true,
}));

describe("usage limits", () => {
  beforeEach(() => {
    transfer.run.mockReset();
  });

  it("dismisses the limit and continues the turn on resume", () => {
    const { deps, session } = setupTurnQueue({ usageLimit: {} });

    createUsageLimits(deps).resume("s");

    expect(session().usageLimit).toBeUndefined();
    expect(deps.submit).toHaveBeenCalledWith("s", CONTINUE_PROMPT);
  });

  it("does not resume a busy session", () => {
    const { deps } = setupTurnQueue({ busy: true, usageLimit: {} });

    createUsageLimits(deps).resume("s");

    expect(deps.submit).not.toHaveBeenCalled();
  });

  it("remembers whether to resume at the reset", () => {
    const { deps, session } = setupTurnQueue({ usageLimit: { resetsAt: 5 } });

    createUsageLimits(deps).setResumeAtReset("s", true);

    expect(session().usageLimit).toEqual({ resetsAt: 5, resumeAtReset: true });
  });

  it("carries the transcript to the other account, then continues there", async () => {
    transfer.run.mockResolvedValue(undefined);
    const { deps, session } = setupTurnQueue({
      usageLimit: {},
      providerSessionId: "native",
      providerAccountId: "work",
    });

    await createUsageLimits(deps).changeAccount("s", "home");

    expect(transfer.run).toHaveBeenCalled();
    expect(session().providerAccountId).toBe("home");
    expect(deps.submit).toHaveBeenCalledWith("s", CONTINUE_PROMPT);
  });

  it("still switches from a handoff when the transcript cannot be carried", async () => {
    transfer.run.mockRejectedValue(new Error("locked"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps, session } = setupTurnQueue({
      usageLimit: {},
      providerSessionId: "native",
      providerAccountId: "work",
    });

    await createUsageLimits(deps).changeAccount("s", "home");

    expect(session().providerAccountId).toBe("home");
    expect(deps.submit).toHaveBeenCalled();
  });
  it("waits for continuation acceptance and reports the result", async () => {
    const { deps } = setupTurnQueue({ usageLimit: {} });
    const submit = vi.fn(async () => true);
    await expect(createUsageLimits({ ...deps, submit }).resume("s")).resolves.toBe(true);
    expect(submit).toHaveBeenCalledWith("s", CONTINUE_PROMPT);
  });

  it.each(["declined", "rejected"])("keeps a manual retry after %s continuation", async (outcome) => {
    const { deps, session } = setupTurnQueue({ usageLimit: { resumeAtReset: true, resetsAt: 5 } });
    const submit = vi.fn(async () => {
      if (outcome === "rejected") throw new Error("submission failed");
      return false;
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(createUsageLimits({ ...deps, submit }).resume("s")).resolves.toBe(false);
    expect(session().usageLimit).toEqual({ resumeAtReset: false, resetsAt: 5 });
  });

  it("preserves a newer usage limit when continuation is declined", async () => {
    const { deps, session } = setupTurnQueue({ usageLimit: { resetsAt: 5 } });
    const submit = vi.fn(async () => {
      deps.updateSessionsNow((sessions) => sessions.map((entry) => ({ ...entry, usageLimit: { resetsAt: 10 } })));
      return false;
    });

    await expect(createUsageLimits({ ...deps, submit }).resume("s")).resolves.toBe(false);
    expect(session().usageLimit).toEqual({ resetsAt: 10 });
  });

});
