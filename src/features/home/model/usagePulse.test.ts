import { describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { usagePulseRows } from "./usagePulse";

describe("usagePulseRows", () => {
  it("lists every known provider with percent or status — never invents %", () => {
    const now = 1_000_000;
    const cards = new Map<UsageProviderId, UsageCardState>([
      [
        "claude",
        {
          status: "ok",
          updatedAt: 1,
          windows: [
            {
              kind: "session",
              label: "Session",
              usedPercent: 42.4,
              resetsAt: now + 2 * 3_600_000 + 30 * 60_000,
            },
          ],
        },
      ],
      ["cursor", { status: "unavailable", reason: "Not signed in" }],
      [
        "codex",
        {
          status: "error",
          reason: "Timeout",
          windows: [
            {
              kind: "weekly",
              label: "Weekly",
              usedPercent: 10,
              resetsAt: null,
            },
          ],
        },
      ],
    ]);

    const rows = usagePulseRows(cards, now);
    expect(rows.map((row) => row.provider)).toEqual([
      "codex",
      "cursor",
      "claude",
      "antigravity",
    ]);
    expect(rows.find((row) => row.provider === "claude")).toMatchObject({
      usedPercent: 42,
      statusLabel: "Session",
      resetLabel: "2h 30m",
    });
    expect(rows.find((row) => row.provider === "cursor")).toMatchObject({
      usedPercent: null,
      statusLabel: "Not signed in",
      resetLabel: null,
    });
    expect(rows.find((row) => row.provider === "codex")).toMatchObject({
      usedPercent: 10,
      resetLabel: null,
    });
    expect(rows.find((row) => row.provider === "antigravity")).toMatchObject({
      usedPercent: null,
      fetching: true,
      statusLabel: "Loading",
      resetLabel: null,
    });
  });
});
