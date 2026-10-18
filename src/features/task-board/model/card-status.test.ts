import { describe, expect, it } from "vitest";
import { cardStatus, elapsedLabel } from "./card-status";

const context = { now: 50 * 60_000, stallMinutes: 45, needsInput: false };

describe("cardStatus", () => {
  it.each([
    [{ columnId: "implement", runState: "failed" }, undefined, "failed:Failed"],
    [{ columnId: "implement", runState: "queued" }, undefined, "queued:Queued"],
    [{ columnId: "grill", runState: "running" }, { status: "running", startedAt: 40 * 60_000 }, "running:Running 10m"],
    [{ columnId: "grill", runState: "running" }, { status: "running", startedAt: 0 }, "stalled:Stalled 50m"],
    [{ columnId: "plan_approval", runState: "idle" }, undefined, "needs_you:Needs you"],
    [{ columnId: "done", runState: "idle" }, undefined, "delivered:Delivered"],
  ] as const)("%o → %s", (card, run, expected) => {
    const status = cardStatus(card, run, context);
    expect(status && `${status.kind}:${status.label}`).toBe(expected);
  });

  it("puts a pending approval ahead of the running clock", () => {
    const status = cardStatus({ columnId: "implement", runState: "running" }, undefined, { ...context, needsInput: true });
    expect(status?.kind).toBe("needs_you");
  });

  it("shows nothing for an idle backlog card", () => {
    expect(cardStatus({ columnId: "backlog", runState: "idle" }, undefined, context)).toBeNull();
  });
});

describe("elapsedLabel", () => {
  it("formats minutes and hours", () => {
    expect(elapsedLabel(10_000)).toBe("<1m");
    expect(elapsedLabel(125 * 60_000)).toBe("2h 5m");
  });
});
