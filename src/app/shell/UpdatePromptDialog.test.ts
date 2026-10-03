import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeUpdatePrompt, openUpdatePrompt } from "../model/updatePrompt";

vi.mock("../model/updater", () => ({ installPendingUpdate: vi.fn() }));
vi.mock("../../shared/ui/Modal", async () => {
  const { ModalPanel } = await vi.importActual<
    typeof import("../../shared/ui/Modal")
  >("../../shared/ui/Modal");
  return { Modal: ModalPanel };
});

const { UpdatePromptDialog } = await import("./UpdatePromptDialog");

afterEach(() => {
  closeUpdatePrompt();
});

function render(): string {
  return renderToStaticMarkup(createElement(UpdatePromptDialog));
}

describe("UpdatePromptDialog", () => {
  it("renders nothing without a pending prompt", () => {
    expect(render()).toBe("");
  });

  it("renders the remote release notes with install actions", () => {
    openUpdatePrompt({
      version: "1.0.3",
      currentVersion: "1.0.2",
      date: "3 Oct 2026",
      notes: "### Added\n\n- **Worktree** workspaces",
    });

    const markup = render();

    expect(markup).toContain("Update available");
    expect(markup).toContain("Vatra 1.0.3 · 3 Oct 2026 · you have 1.0.2");
    expect(markup).toContain('aria-label="Release notes for Vatra 1.0.3"');
    expect(markup).not.toContain("What&#x27;s new");
    expect(markup).toContain('data-streamdown="strong">Worktree');
    expect(markup).not.toContain("**Worktree**");
    expect(markup).toContain("Later");
    expect(markup).toContain("Install and restart");
  });

  it("falls back when the release has no notes", () => {
    openUpdatePrompt({
      version: "1.0.3",
      currentVersion: "1.0.2",
      date: null,
      notes: null,
    });

    const markup = render();

    expect(markup).toContain("Vatra 1.0.3 · you have 1.0.2");
    expect(markup).toContain(
      "Release notes for this version are not available",
    );
  });
});
