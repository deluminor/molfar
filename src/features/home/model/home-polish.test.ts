import { describe, expect, it } from "vitest";
import { isHostPressureHigh } from "./host-stats";
import {
  automationRowMeta,
  type RecentAutomationRow,
} from "./recent-automations";

function row(patch: Partial<RecentAutomationRow>): RecentAutomationRow {
  return {
    id: "a",
    name: "A",
    enabled: true,
    nextRunAt: 0,
    lastRunStatus: null,
    createdAt: 0,
    ...patch,
  };
}

describe("isHostPressureHigh", () => {
  it("warns at 85% and above only", () => {
    expect(isHostPressureHigh(84.9)).toBe(false);
    expect(isHostPressureHigh(85)).toBe(true);
    expect(isHostPressureHigh(Number.NaN)).toBe(false);
  });
});

describe("automationRowMeta", () => {
  it("marks paused automations", () => {
    expect(automationRowMeta(row({ enabled: false }))).toEqual({
      label: "paused",
      failed: false,
    });
  });

  it("flags failed and cancelled last runs", () => {
    expect(automationRowMeta(row({ lastRunStatus: "failed" }))).toEqual({
      label: "failed",
      failed: true,
    });
    expect(automationRowMeta(row({ lastRunStatus: "cancelled" })).failed).toBe(
      true,
    );
  });

  it("prefers the next due time over a healthy last run", () => {
    const meta = automationRowMeta(
      row({ lastRunStatus: "succeeded", nextRunAt: Date.now() + 3_600_000 }),
    );
    expect(meta.failed).toBe(false);
    expect(meta.label).not.toBe("succeeded");
  });
});
