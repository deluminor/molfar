// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../../sessions/ui/AgentMarkdown", () => ({
  AgentMarkdown: ({ text }: { text: string }) => text,
}));
import { CardOverview } from "../CardOverview";
import { timelineCard, timelineRun } from "./fixtures.test-support";
import type { StageRun } from "../../../types/stage";
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(120000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(runs: StageRun[]) {
  act(() =>
    root.render(
      createElement(CardOverview, {
        card: timelineCard,
        runs,
        stallMinutes: 45,
        needsInput: true,
        onAct: async () => {},
        onOpenSession: vi.fn(),
      }),
    ),
  );
}
it("shares one clock across preview, vertical list, modal and details, and cleans up on Overview departure", () => {
  const runs = [
    timelineRun(),
    timelineRun({
      id: "closed",
      startedAt: 1000,
      completedAt: 60000,
      status: "succeeded",
    }),
  ];
  render(runs);
  const expand = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Expand timeline",
  );
  if (!expand) throw new Error("Missing expansion");
  act(() => expand.click());
  expect(vi.getTimerCount()).toBe(1);
  const label = document.querySelector('[aria-label="Inspect Implement"]');
  if (!(label instanceof HTMLElement)) throw new Error("Missing lane");
  act(() => label.click());
  const previewMark = container.querySelector<HTMLElement>(
    ".timeline-mini-track:last-child .timeline-bar",
  );
  const closedWidth = previewMark?.style.width;
  act(() => vi.advanceTimersByTime(60000));
  expect(container.querySelector("ol")?.textContent).toContain("3m");
  expect(
    document.querySelector('[aria-label="Selected run details"]')?.textContent,
  ).toContain("3m");
  expect(
    container.querySelector(".stage-timeline-preview")?.textContent,
  ).toContain("3m");
  expect(
    container.querySelector(".stage-timeline-preview")?.textContent,
  ).toContain("Needs you");
  expect(
    container.querySelector<HTMLElement>(
      ".timeline-mini-track:last-child .timeline-bar",
    )?.style.width,
  ).not.toBe(closedWidth);
  render(
    runs.map((run) => ({
      ...run,
      completedAt: run.completedAt ?? 180000,
      status: "succeeded",
    })),
  );
  expect(vi.getTimerCount()).toBe(0);
  act(() => root.render(null));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps hover details during pointer transfer, dismisses after departure, and retains touch-selected details", () => {
  render([
    timelineRun({ error: "long\nerror", status: "failed", sessionId: null }),
  ]);
  const expand = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Expand timeline",
  );
  act(() => expand?.click());
  const lane = document.querySelector('[aria-label="Inspect Implement"]');
  if (!(lane instanceof HTMLElement)) throw new Error("Missing lane");
  act(() =>
    lane.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })),
  );
  const popover = document.querySelector("[data-dialog-popover]");
  expect(popover).not.toBeNull();
  act(() =>
    lane.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        relatedTarget: popover?.lastElementChild,
      }),
    ),
  );
  act(() =>
    popover?.lastElementChild?.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, relatedTarget: lane }),
    ),
  );
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector("[data-dialog-popover]")).not.toBeNull();
  act(() =>
    popover?.lastElementChild?.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    ),
  );
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector("[data-dialog-popover]")).toBeNull();
  act(() => lane.click());
  expect(
    document.querySelector('[aria-label="Selected run details"]')?.textContent,
  ).toContain("long\nerror");
});
