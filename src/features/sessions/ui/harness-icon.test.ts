import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HarnessIcon } from "./HarnessIcon";

describe("HarnessIcon", () => {
  it("optically insets the detailed Hermes artwork at UI icon sizes", () => {
    const html = renderToStaticMarkup(
      createElement(HarnessIcon, {
        harness: "hermes",
        className: "size-4 shrink-0",
      }),
    );
    expect(html).toContain("items-center justify-center");
    expect(html).toContain("size-[72%]");
  });
});
