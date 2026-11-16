// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { layoutTimeline } from "../../../model/stage-timeline/layout";
import { StageTimelineDialog } from "./StageTimelineDialog";
import { timelineRun } from "./fixtures.test-support";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it("dismisses transient inspection on Tab to persistent details so Escape then closes modal", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onClose = vi.fn();
  act(() =>
    root?.render(
      createElement(StageTimelineDialog, {
        title: "Timeline",
        layout: layoutTimeline([timelineRun({ sessionId: null })], 120000),
        summary: "Running",
        onClose,
        onOpenSession: vi.fn(),
      }),
    ),
  );
  const interval = document.querySelector<HTMLElement>(
    '[aria-label="Inspect Implement interval"]',
  );
  const details = document.querySelector<HTMLElement>(
    '[aria-label="Selected run details"]',
  );
  if (!interval || !details) throw new Error("Missing inspection controls");
  act(() => interval.focus());
  expect(document.querySelector("[data-dialog-popover]")).not.toBeNull();
  act(() =>
    interval.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  act(() => details.focus());
  expect(document.querySelector("[data-dialog-popover]")).toBeNull();
  expect(details.textContent).toContain("full-model-name");
  act(() =>
    details.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});
