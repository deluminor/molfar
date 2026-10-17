import { describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "./usageCard";
import {
  listedUsageProviders,
  orderUsageProviders,
} from "./usageProviders";

describe("orderUsageProviders", () => {
  it("puts preferred trio first when all present", () => {
    expect(
      orderUsageProviders(["antigravity", "cursor", "claude", "codex"]),
    ).toEqual(["claude", "codex", "cursor", "antigravity"]);
  });

  it("skips missing preferred providers", () => {
    expect(orderUsageProviders(["antigravity", "cursor"])).toEqual([
      "cursor",
      "antigravity",
    ]);
  });

  it("keeps extras after preferred in harness order", () => {
    expect(orderUsageProviders(["antigravity", "claude"])).toEqual([
      "claude",
      "antigravity",
    ]);
  });

  it("returns empty for an empty set", () => {
    expect(orderUsageProviders([])).toEqual([]);
  });
});

describe("listedUsageProviders", () => {
  it("omits unavailable cards and orders the rest", () => {
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
              usedPercent: 10,
              resetsAt: null,
            },
          ],
        },
      ],
      ["codex", { status: "unavailable", reason: "Not signed in" }],
      ["cursor", { status: "loading" }],
      [
        "antigravity",
        {
          status: "error",
          reason: "Timeout",
          windows: [],
        },
      ],
    ]);

    expect(listedUsageProviders(cards)).toEqual([
      "claude",
      "cursor",
      "antigravity",
    ]);
  });

  it("treats missing cards as still listed (loading)", () => {
    expect(listedUsageProviders(new Map())).toEqual([
      "claude",
      "codex",
      "cursor",
      "antigravity",
    ]);
  });

  it("returns empty when every provider is unavailable", () => {
    const cards = new Map<UsageProviderId, UsageCardState>([
      ["claude", { status: "unavailable", reason: "Nope" }],
      ["codex", { status: "unavailable", reason: "Nope" }],
      ["cursor", { status: "unavailable", reason: "Nope" }],
      ["antigravity", { status: "unavailable", reason: "Nope" }],
    ]);
    expect(listedUsageProviders(cards)).toEqual([]);
  });
});
