import { beforeEach, describe, expect, it, vi } from "vitest";
import { compactContext } from "./compact-context";
import { setupTurnControl } from "./turn-control.fixture";

const harness = vi.hoisted(() => ({
  supported: true,
  compact: vi.fn<(input: { sessionId: string }) => Promise<void>>(),
}));

vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  canCompactHarnessContext: () => harness.supported,
  compactHarnessContext: (input: { sessionId: string }) => harness.compact(input),
}));

describe("compactContext", () => {
  beforeEach(() => {
    harness.supported = true;
    harness.compact.mockReset();
  });

  it("refuses a busy session", () => {
    const { deps } = setupTurnControl({ busy: true });

    expect(compactContext(deps, "s")).toBe(false);
    expect(harness.compact).not.toHaveBeenCalled();
  });

  it("says so when the harness cannot compact", () => {
    harness.supported = false;
    const { deps, session } = setupTurnControl();

    expect(compactContext(deps, "s")).toBe(true);
    expect(session().busy).toBeFalsy();
    expect(JSON.stringify(session().blocks)).toContain(
      "does not support manual context compaction",
    );
  });

  it("marks the session busy, compacts, reports and frees it", async () => {
    harness.compact.mockResolvedValue(undefined);
    const { deps, session } = setupTurnControl();

    expect(compactContext(deps, "s")).toBe(true);
    expect(session().busy).toBe(true);

    await vi.waitFor(() => expect(session().busy).toBe(false));
    expect(harness.compact).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s" }));
    expect(deps.enqueueHarnessEvent).toHaveBeenCalledWith("s", {
      type: "status",
      text: "Compacted context",
    });
    expect(deps.flushHarnessEvents).toHaveBeenCalled();
  });

  it("reports a failed compaction as a session error", async () => {
    harness.compact.mockRejectedValue(new Error("offline"));
    const { deps, session } = setupTurnControl();

    compactContext(deps, "s");

    await vi.waitFor(() => expect(session().busy).toBe(false));
    expect(deps.enqueueHarnessEvent).toHaveBeenCalledWith("s", {
      type: "session.error",
      message: "offline",
    });
  });

  it("drops the outcome once a later turn took over", async () => {
    let finish: () => void = () => undefined;
    harness.compact.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { deps, session } = setupTurnControl();

    compactContext(deps, "s");
    deps.turnGen.set("s", 99);
    finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(session().busy).toBe(true);
    expect(deps.enqueueHarnessEvent).not.toHaveBeenCalled();
  });
});
