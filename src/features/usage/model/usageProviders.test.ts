import { describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "./usageCard";
import {
  isUsageCardsPending,
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

  it("omits missing cards (pending load uses a neutral skeleton)", () => {
    expect(listedUsageProviders(new Map())).toEqual([]);
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

describe("isUsageCardsPending", () => {
  it("is pending when the map is empty", () => {
    expect(isUsageCardsPending(new Map())).toBe(true);
  });

  it("is pending when every known card is still loading", () => {
    const cards = new Map<UsageProviderId, UsageCardState>([
      ["claude", { status: "loading" }],
      ["codex", { status: "loading" }],
      ["cursor", { status: "loading" }],
      ["antigravity", { status: "loading" }],
    ]);
    expect(isUsageCardsPending(cards)).toBe(true);
  });

  it("is not pending once any provider has settled", () => {
    const cards = new Map<UsageProviderId, UsageCardState>([
      ["claude", { status: "unavailable", reason: "Nope" }],
      ["codex", { status: "loading" }],
    ]);
    expect(isUsageCardsPending(cards)).toBe(false);
  });
});
