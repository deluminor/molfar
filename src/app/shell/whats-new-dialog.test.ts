import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WhatsNewBody } from "./WhatsNewDialog";

describe("WhatsNewBody", () => {
  it("renders an accordion with the focus version expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(WhatsNewBody, { version: "1.0.0" }),
    );

    expect(markup).toContain("whats-new-md");
    expect(markup).toContain("What&#x27;s new in MOLFAR 1.0.0");
    expect(markup).not.toContain("## [1.0.0]");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-version="1.0.0"');
    expect(markup).toContain('role="list"');
  });

  it("keeps other releases collapsed with foreshadow chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(WhatsNewBody, { version: "1.0.16" }),
    );

    expect(markup).toContain('data-version="1.0.16"');
    expect(markup).toContain('data-version="1.0.15"');
    expect(markup).toMatch(
      /data-version="1\.0\.15"[^>]*aria-expanded="false"/,
    );
  });
});
