import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UpdaterSnapshot } from "@/features/updates/model/updater";
import { UpdatePromptFooter } from "./UpdatePromptFooter";

function render(snapshot: UpdaterSnapshot | null): string {
  return renderToStaticMarkup(
    createElement(UpdatePromptFooter, {
      snapshot,
      onLater: vi.fn(),
      onInstall: vi.fn(),
    }),
  );
}

function disabledButtons(markup: string): number {
  return markup.match(/<button[^>]*disabled=""/g)?.length ?? 0;
}

describe("UpdatePromptFooter", () => {
  it("enables both actions before an install starts", () => {
    const markup = render(null);

    expect(disabledButtons(markup)).toBe(0);
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).not.toContain('role="alert"');
  });

  it("locks the actions and shows progress while downloading", () => {
    const markup = render({
      phase: "downloading",
      currentVersion: "1.0.2",
      availableVersion: "1.0.3",
      progress: 42,
    });

    expect(disabledButtons(markup)).toBe(2);
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain("42%");
  });

  it("shows an indeterminate label when the size is unknown", () => {
    const markup = render({ phase: "downloading", currentVersion: "1.0.2" });

    expect(markup).toContain("Downloading…");
  });

  it("shows the install error and lets the user retry", () => {
    const markup = render({
      phase: "error",
      currentVersion: "1.0.2",
      error: "offline",
    });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Couldn&#x27;t install the update. offline");
    expect(disabledButtons(markup)).toBe(0);
  });
});
