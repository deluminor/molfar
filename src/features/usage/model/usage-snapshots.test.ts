import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UsageCardState, UsageProviderId } from "./usage-card";
import {
  USAGE_SNAPSHOTS_STORAGE_KEY,
  loadUsageSnapshots,
  parseUsageSnapshots,
  primaryUsedPercent,
  recordUsageSnapshots,
  usageTrendSeries,
} from "./usage-snapshots";

function mockLocalStorage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
    },
    configurable: true,
  });
}

beforeEach(() => {
  mockLocalStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe("primaryUsedPercent", () => {
  it("returns null when there is no real window", () => {
    expect(primaryUsedPercent({ status: "loading" })).toBeNull();
    expect(
      primaryUsedPercent({ status: "unavailable", reason: "Nope" }),
    ).toBeNull();
    expect(
      primaryUsedPercent({ status: "error", reason: "x", windows: [] }),
    ).toBeNull();
  });

  it("reads the first window percent", () => {
    const ok: UsageCardState = {
      status: "ok",
      updatedAt: 1,
      windows: [
        { kind: "session", label: "Session", usedPercent: 42.4, resetsAt: null },
      ],
    };
    expect(primaryUsedPercent(ok)).toBe(42);
  });
});

describe("recordUsageSnapshots", () => {
  it("stores only providers with real readings and merges the same day", () => {
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
      ["cursor", { status: "unavailable", reason: "Not signed in" }],
    ]);
    const at = new Date(2026, 3, 1, 12).getTime();
    const first = recordUsageSnapshots(cards, at, []);
    expect(first).toEqual([
      { dateKey: "2026-04-01", providers: { claude: 10 } },
    ]);

    cards.set("codex", {
      status: "ok",
      updatedAt: 2,
      windows: [
        { kind: "weekly", label: "Weekly", usedPercent: 80, resetsAt: null },
      ],
    });
    const second = recordUsageSnapshots(cards, at, first);
    expect(second).toEqual([
      { dateKey: "2026-04-01", providers: { claude: 10, codex: 80 } },
    ]);
    expect(loadUsageSnapshots()).toEqual(second);
    expect(localStorage.getItem(USAGE_SNAPSHOTS_STORAGE_KEY)).toContain(
      "2026-04-01",
    );
  });
});

describe("usageTrendSeries", () => {
  it("averages reported providers and keeps empty days null", () => {
    expect(
      usageTrendSeries(
        parseUsageSnapshots([
          { dateKey: "2026-01-01", providers: { claude: 10, codex: 30 } },
          { dateKey: "2026-01-02", providers: {} },
        ]),
      ),
    ).toEqual([
      { dateKey: "2026-01-01", value: 20 },
      { dateKey: "2026-01-02", value: null },
    ]);
  });
});
