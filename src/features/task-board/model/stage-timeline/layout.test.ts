import { describe, expect, it } from "vitest";
import { layoutTimeline } from "./layout";
import type { StageRun } from "../../types/stage";

function run(
  id: string,
  startedAt: number,
  completedAt: number | null,
): StageRun {
  return {
    id,
    cardId: "card",
    stage: "implement",
    attempt: 1,
    sessionId: null,
    harness: "codex",
    model: "model",
    settingsJson: "{}",
    runtimeMode: "auto",
    templateVersion: 1,
    dispatch: "settled",
    status: "succeeded",
    error: null,
    headBefore: null,
    porcelainBefore: null,
    fingerprintBefore: null,
    headAfter: null,
    startedAt,
    completedAt,
  };
}

describe("layoutTimeline", () => {
  it("preserves gaps and overlaps on a shared elapsed domain", () => {
    const result = layoutTimeline(
      [run("late", 4000, 6000), run("early", 1000, 5000)],
      9000,
    );
    expect(result.totalElapsed).toBe(5000);
    expect(result.rows.map((row) => row.run.id)).toEqual(["early", "late"]);
    expect(result.rows[0].interval).toEqual({
      start: 1000,
      end: 5000,
      duration: 4000,
      left: 0,
      width: 80,
    });
    expect(result.rows[1].interval?.left).toBe(60);
    expect(result.rows[1].interval?.width).toBe(40);
  });
  it("retains retries and stable input order for tied starts without mutating input", () => {
    const first = run("first", 100, 200);
    const retry = { ...run("retry", 100, 300), attempt: 2 };
    const input = Object.freeze([retry, first]);
    expect(layoutTimeline(input, 400).rows.map((row) => row.run)).toEqual([
      retry,
      first,
    ]);
    expect(input[0]).toBe(retry);
  });

  it("omits bounds for empty or invalid-only histories while retaining metadata", () => {
    expect(layoutTimeline([], 100)).toEqual({
      origin: null,
      extent: null,
      totalElapsed: null,
      rows: [],
    });
    const invalid = {
      ...run("invalid", NaN, 500),
      sessionId: "session",
      error: "failure",
    };
    const result = layoutTimeline([invalid, run("bad-end", 0, Infinity)], 900);
    expect(result.origin).toBeNull();
    expect(result.extent).toBeNull();
    expect(result.totalElapsed).toBeNull();
    expect(result.rows.every((row) => row.interval === null)).toBe(true);
    expect(result.rows[0].run).toBe(invalid);
  });

  it("ignores invalid intervals when finding bounds", () => {
    const result = layoutTimeline(
      [run("invalid", -Infinity, 900), run("valid", 100, 200)],
      500,
    );
    expect(result.origin).toBe(100);
    expect(result.extent).toBe(200);
    expect(result.rows[1].interval).toBeNull();
  });

  it("clamps zero, negative, and future open intervals to zero duration", () => {
    const result = layoutTimeline(
      [
        run("zero", 5000, 5000),
        run("negative", 5000, 1000),
        run("future", 5000, null),
      ],
      1000,
    );
    expect(result.totalElapsed).toBe(0);
    for (const row of result.rows) {
      expect(row.interval).toEqual({
        start: 5000,
        end: 5000,
        duration: 0,
        left: 0,
        width: 0,
      });
    }
  });

  it("uses a minimum one-second domain for subsecond runs", () => {
    expect(
      layoutTimeline([run("short", 100, 200)], 900).rows[0].interval?.width,
    ).toBe(10);
  });

  it("advances null endpoints for running and terminal statuses without changing their statuses", () => {
    const running = {
      ...run("running", 1000, null),
      status: "running" as const,
    };
    const terminal = run("terminal", 1000, null);
    const result = layoutTimeline([running, terminal], 5000);
    expect(result.rows.map((row) => row.interval?.duration)).toEqual([
      4000, 4000,
    ]);
    expect(result.rows.map((row) => row.completionUnavailable)).toEqual([
      false,
      true,
    ]);
    expect(result.rows[1].run.status).toBe("succeeded");
    expect(layoutTimeline([running], 6000).rows[0].interval?.duration).toBe(
      5000,
    );
    expect(layoutTimeline([run("closed", 1000, 2000)], NaN).totalElapsed).toBe(
      1000,
    );
  });

  it("retains finite geometry across long spans and idle gaps", () => {
    const result = layoutTimeline(
      [run("early", 0, 1000), run("late", 1e12, 2e12)],
      3e12,
    );
    expect(result.totalElapsed).toBe(2e12);
    expect(result.rows[1].interval?.left).toBe(50);
    expect(result.rows[1].interval?.width).toBe(50);
  });
  it("keeps geometry finite even when bounds subtraction overflows", () => {
    const result = layoutTimeline(
      [run("early", -1e308, -1e308), run("late", 1e308, 1e308)],
      0,
    );
    expect(result.totalElapsed).toBe(Number.MAX_VALUE);
    expect(result.rows.map((row) => row.interval?.left)).toEqual([0, 100]);
  });
});
