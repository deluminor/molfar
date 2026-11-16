import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeUpdatePrompt,
  getUpdatePrompt,
  openUpdatePrompt,
  subscribeUpdatePrompt,
  type UpdatePrompt,
} from "./update-prompt";

const PROMPT: UpdatePrompt = {
  version: "1.0.3",
  currentVersion: "1.0.2",
  date: "3 Oct 2026",
  notes: "### Added",
};

beforeEach(() => {
  closeUpdatePrompt();
});

describe("updatePrompt", () => {
  it("opens and closes the prompt, notifying subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdatePrompt(listener);

    openUpdatePrompt(PROMPT);
    expect(getUpdatePrompt()).toBe(PROMPT);

    closeUpdatePrompt();
    expect(getUpdatePrompt()).toBeNull();

    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the open prompt when the same version is offered again", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdatePrompt(listener);

    openUpdatePrompt(PROMPT);
    openUpdatePrompt({ ...PROMPT, notes: "other" });

    expect(getUpdatePrompt()).toBe(PROMPT);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("does not notify when closing an already closed prompt", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdatePrompt(listener);

    closeUpdatePrompt();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
