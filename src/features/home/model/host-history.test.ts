import { describe, expect, it } from "vitest";
import {
  HOST_HISTORY_LIMIT,
  clampPercent,
  processSeriesAsPercent,
  pushHostSample,
  sparklineGeometry,
} from "./host-history";
import { loadAsPercent, type HostStats } from "./host-stats";

function sample(
  partial: Partial<HostStats> & Pick<HostStats, "cpuPercent" | "memoryPercent">,
): HostStats {
  return {
    swapPercent: 0,
    loadAverage: null,
    cpuCount: 1,
    processCount: 0,
    ...partial,
  };
}

describe("pushHostSample", () => {
  it("appends a clamped sample with derived load", () => {
    const next = pushHostSample(
      [],
      sample({
        cpuPercent: 12.4,
        memoryPercent: 88.9,
        swapPercent: 10,
        loadAverage: 2,
        cpuCount: 4,
        processCount: 100,
      }),
      1_000,
    );
    expect(next).toEqual([
      {
        cpuPercent: 12.4,
        memoryPercent: 88.9,
        swapPercent: 10,
        loadPercent: 50,
        processCount: 100,
        at: 1_000,
      },
    ]);
  });

  it("trims to the history limit, keeping the newest", () => {
    let history = pushHostSample(
      [],
      sample({ cpuPercent: 1, memoryPercent: 1 }),
      1,
    );
    for (let i = 2; i <= HOST_HISTORY_LIMIT + 5; i++) {
      history = pushHostSample(
        history,
        sample({ cpuPercent: i, memoryPercent: i }),
        i,
      );
    }
    expect(history).toHaveLength(HOST_HISTORY_LIMIT);
    expect(history[0]?.at).toBe(6);
    expect(history[history.length - 1]?.at).toBe(HOST_HISTORY_LIMIT + 5);
  });

  it("clamps non-finite percents to zero", () => {
    const next = pushHostSample(
      [],
      sample({
        cpuPercent: Number.NaN,
        memoryPercent: Number.POSITIVE_INFINITY,
        swapPercent: Number.NaN,
      }),
      1,
    );
    expect(next[0]?.cpuPercent).toBe(0);
    expect(next[0]?.memoryPercent).toBe(0);
    expect(next[0]?.swapPercent).toBe(0);
  });
});

describe("loadAsPercent", () => {
  it("scales load by core count", () => {
    expect(loadAsPercent(4, 8)).toBe(50);
    expect(loadAsPercent(null, 8)).toBe(0);
  });
});

describe("processSeriesAsPercent", () => {
  it("normalizes against the peak in the window", () => {
    expect(processSeriesAsPercent([50, 100, 25])).toEqual([50, 100, 25]);
  });
});

describe("clampPercent", () => {
  it("bounds values to 0–100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42)).toBe(42);
  });
});

describe("sparklineGeometry", () => {
  it("returns empty paths for an empty series", () => {
    expect(sparklineGeometry([], 100, 40)).toEqual({ line: "", area: "" });
  });

  it("places a single sample in the horizontal center", () => {
    const geo = sparklineGeometry([50], 100, 40);
    expect(geo.line).toContain("M50.00");
    expect(geo.area.endsWith("Z")).toBe(true);
  });

  it("builds a polyline across the full width for multiple samples", () => {
    const geo = sparklineGeometry([0, 100], 100, 40);
    expect(geo.line.startsWith("M0.00")).toBe(true);
    expect(geo.line).toContain("L100.00");
  });
});
