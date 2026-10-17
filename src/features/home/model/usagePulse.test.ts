import { describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { usagePulseRows } from "./usagePulse";

describe("usagePulseRows", () => {
  it("lists connected providers in preferred order — never invents %", () => {
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
      [
        "antigravity",
        {
          status: "ok",
          updatedAt: 1,
          windows: [
            {
              kind: "session",
              label: "Quota",
              usedPercent: 5,
              resetsAt: null,
            },
          ],
        },
      ],
    ]);

    const rows = usagePulseRows(cards, now);
    expect(rows.map((row) => row.provider)).toEqual([
      "claude",
      "codex",
      "antigravity",
    ]);
    expect(rows.find((row) => row.provider === "claude")).toMatchObject({
      usedPercent: 42,
      statusLabel: "Session",
      resetLabel: "2h 30m",
    });
    expect(rows.find((row) => row.provider === "cursor")).toBeUndefined();
    expect(rows.find((row) => row.provider === "codex")).toMatchObject({
      usedPercent: 10,
      resetLabel: null,
    });
    expect(rows.find((row) => row.provider === "antigravity")).toMatchObject({
      usedPercent: 5,
      statusLabel: "Quota",
    });
  });

  it("returns no rows when every provider is unavailable", () => {
    const cards = new Map<UsageProviderId, UsageCardState>([
      ["claude", { status: "unavailable", reason: "Nope" }],
      ["codex", { status: "unavailable", reason: "Nope" }],
      ["cursor", { status: "unavailable", reason: "Nope" }],
      ["antigravity", { status: "unavailable", reason: "Nope" }],
    ]);
    expect(usagePulseRows(cards)).toEqual([]);
  });
});
