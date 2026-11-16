// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StageTimeline } from "./StageTimeline";
import { timelineCard, timelineRun } from "./fixtures.test-support";
import type { StageRun } from "../../../types/stage";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const onOpenSession = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onOpenSession.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function render(runs: StageRun[], now = 120000, id = "c") {
  act(() =>
    root.render(
      createElement(StageTimeline, {
        key: id,
        card: { ...timelineCard, id },
        runs,
        now,
        refresh: vi.fn(),
        stallMinutes: 45,
        needsInput: false,
        onOpenSession,
      }),
    ),
  );
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (entry) =>
      entry.getAttribute("aria-label") === label || entry.textContent === label,
  );
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function expand() {
  act(() => button("Expand timeline").click());
}

it("keeps vertical errors and attempts below a decorative bounded preview", () => {
  render([
    timelineRun({ status: "failed", error: "line one\nline two", attempt: 2 }),
  ]);
  expect(container.textContent).toContain("line one\nline two");
  expect(container.textContent).toContain("attempt 2");
  expect(
    container.querySelector(".stage-timeline-preview")?.nextElementSibling
      ?.tagName,
  ).toBe("OL");
  expect(container.querySelector('[aria-hidden="true"] button')).toBeNull();
});
it("shows one empty state and no expand control", () => {
  render([]);
  expect(container.textContent).toBe("No stage has run yet.");
  expect(container.querySelector("button")).toBeNull();
});
it("closes before opening exact session once, from either session action", () => {
  render([timelineRun({ status: "succeeded", completedAt: 60000 })]);
  onOpenSession.mockImplementation(() =>
    expect(document.querySelector('[role="dialog"]')).toBeNull(),
  );
  expand();
  act(() => button("Open Implement session").click());
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith("session");
  expect(document.activeElement).toBe(button("Expand timeline"));
  onOpenSession.mockClear();
  expand();
  act(() => button("Open Implement session control").click());
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith("session");
});
it("retains DOM identity, focus, selected details and scroll across ticks", () => {
  const runs = [timelineRun({ sessionId: null })];
  render(runs);
  expand();
  const inspect = button("Inspect Implement");
  act(() => inspect.focus());
  const chart = document.querySelector(".timeline-chart");
  if (!(chart instanceof HTMLElement)) throw new Error("Missing chart");
  chart.scrollTop = 50;
  render(runs, 180000);
  expect(button("Inspect Implement")).toBe(inspect);
  expect(document.activeElement).toBe(inspect);
  expect(chart.scrollTop).toBe(50);
  expect(
    document.querySelector('[aria-label="Selected run details"]')?.textContent,
  ).toContain("3m");
});
it("contains keyboard focus and restores expansion focus on close", () => {
  render([timelineRun({ sessionId: null })]);
  expand();
  const close = button("Close");
  act(() => close.focus());
  act(() =>
    close.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement).toBe(
    document.querySelector('[aria-label="Selected run details"]'),
  );
  act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement).toBe(close);
  act(() => close.click());
  expect(document.activeElement).toBe(button("Expand timeline"));
});
it("dismisses details before modal on Escape and removes stale modal on card change", () => {
  render([timelineRun()]);
  expand();
  act(() => button("Inspect Implement").focus());
  act(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector("[data-dialog-popover]")).toBeNull();
  act(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expand();
  render([timelineRun()], 120000, "next");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("renders invalid timing with inspection and session access, all statuses and retries", () => {
  const statuses = [
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
  ] as const;
  render(
    statuses.map((status, index) =>
      timelineRun({
        id: String(index),
        status,
        startedAt: index ? index : NaN,
        completedAt: null,
        attempt: index + 1,
      }),
    ),
  );
  expand();
  expect(document.querySelectorAll(".timeline-lane")).toHaveLength(5);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Timing unavailable",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Completion time unavailable",
  );
  act(() => button("Inspect Implement attempt 3").click());
  expect(
    document.querySelector('[aria-label="Selected run details"]')?.textContent,
  ).toContain("Failed");
});

it("retains all 30 preview tracks and closes through backdrop without changing history", () => {
  const runs = Array.from({ length: 30 }, (_, index) =>
    timelineRun({ id: String(index), attempt: index + 1 }),
  );
  render(runs);
  expect(container.querySelectorAll(".timeline-mini-track")).toHaveLength(30);
  expand();
  expect(document.querySelectorAll(".timeline-lane")).toHaveLength(30);
  act(() =>
    document
      .querySelector(".modal-backdrop")
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelectorAll("li")).toHaveLength(30);
});

it("uses current card status despite historical failures and inspects without sessions", () => {
  render([
    timelineRun({ status: "failed", sessionId: null, error: "old failure" }),
  ]);
  expect(
    container.querySelector(".stage-timeline-preview")?.textContent,
  ).toContain("Starting");
  expand();
  expect(
    document.querySelector('[aria-label="Open Implement session"]'),
  ).toBeNull();
  act(() => button("Inspect Implement interval").click());
  expect(
    document.querySelector('[aria-label="Selected run details"]')?.textContent,
  ).toContain("old failure");
});
