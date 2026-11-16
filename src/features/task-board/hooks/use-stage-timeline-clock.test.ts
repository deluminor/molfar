// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStageTimelineClock } from "./use-stage-timeline-clock";
import { timelineRun } from "../ui/card-detail/timeline/fixtures.test-support";
import type { StageRun } from "../types/stage";
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
function Clock({ runs, cardId }: { runs: StageRun[]; cardId: string }) {
  const { now, refresh } = useStageTimelineClock(runs, cardId);
  return createElement("button", { onClick: refresh }, now);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(runs: StageRun[], cardId = "c") {
  act(() => root.render(createElement(Clock, { runs, cardId })));
}
it("ticks once per second for valid open intervals, including terminal ones; stops on completion", () => {
  render([timelineRun({ status: "failed" })]);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(2000));
  expect(container.textContent).toBe("3000");
  render([timelineRun({ completedAt: 3000 })]);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not tick for empty or malformed histories and refreshes on card change", () => {
  render([]);
  expect(vi.getTimerCount()).toBe(0);
  render([timelineRun({ startedAt: NaN })]);
  expect(vi.getTimerCount()).toBe(0);
  vi.setSystemTime(9000);
  render([], "next");
  expect(container.textContent).toBe("9000");
});
it("refreshes on demand and cleans up on unmount", () => {
  render([timelineRun()]);
  vi.setSystemTime(5000);
  act(() => container.querySelector("button")?.click());
  expect(container.textContent).toBe("5000");
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
});
