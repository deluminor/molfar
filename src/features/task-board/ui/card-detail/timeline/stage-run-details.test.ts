import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StageRunDetails } from "./StageRunDetails";
import { layoutTimeline } from "../../../model/stage-timeline/layout";
import { timelineRun } from "./fixtures.test-support";

it("retains full model, multiline error, attempt and missing completion without claiming running", () => {
  const row = layoutTimeline(
    [
      timelineRun({
        status: "interrupted",
        attempt: 2,
        error: "first\nsecond",
        model: "x".repeat(500),
      }),
    ],
    120000,
  ).rows[0];
  const html = renderToStaticMarkup(createElement(StageRunDetails, { row }));
  for (const text of [
    "Interrupted",
    "attempt 2",
    "first\nsecond",
    "x".repeat(500),
    "Completion time unavailable",
    "2m",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Running");
});
it("exposes invalid dates safely and hides stale success errors", () => {
  const row = layoutTimeline(
    [
      timelineRun({
        status: "succeeded",
        error: "stale",
        startedAt: NaN,
        completedAt: Infinity,
      }),
    ],
    120000,
  ).rows[0];
  const html = renderToStaticMarkup(createElement(StageRunDetails, { row }));
  expect(html).toContain("Timing unavailable");
  expect(html).not.toContain("stale");
});
