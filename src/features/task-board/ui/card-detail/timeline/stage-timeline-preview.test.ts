import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StageTimelinePreview } from "./StageTimelinePreview";

it("omits summary, axes and expansion for an empty history", () => {
  const html = renderToStaticMarkup(
    createElement(StageTimelinePreview, {
      layout: { origin: null, extent: null, totalElapsed: null, rows: [] },
      summary: "Delivered",
      onExpand: vi.fn(),
    }),
  );
  expect(html).toContain("No stage has run yet.");
  expect(html).not.toContain("button");
  expect(html).not.toContain("Delivered");
});
