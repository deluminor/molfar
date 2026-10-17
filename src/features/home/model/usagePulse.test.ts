import { describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { usagePulseRows } from "./usagePulse";

describe("usagePulseRows", () => {
  it("lists every known provider with percent or status — never invents %", () => {
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
              resetsAt: null,
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

    const rows = usagePulseRows(cards);
    expect(rows.map((row) => row.provider)).toEqual([
      "codex",
      "cursor",
      "claude",
      "antigravity",
    ]);
    expect(rows.find((row) => row.provider === "claude")).toMatchObject({
      usedPercent: 42,
      statusLabel: "Session",
    });
    expect(rows.find((row) => row.provider === "cursor")).toMatchObject({
      usedPercent: null,
      statusLabel: "Not signed in",
    });
    expect(rows.find((row) => row.provider === "antigravity")).toMatchObject({
      usedPercent: null,
      fetching: true,
      statusLabel: "Loading",
    });
  });
});
