import { describe, expect, it } from "vitest";
import { isStalled, needsYou } from "./attention";
import { pullRequestBody, pullRequestNumber, pullRequestTitle } from "./delivery-text";

describe("attention", () => {
  it("flags a running stage once it passes the stall time", () => {
    expect(isStalled({ status: "running", startedAt: 0 }, 45 * 60_000, 45)).toBe(true);
    expect(isStalled({ status: "running", startedAt: 0 }, 44 * 60_000, 45)).toBe(false);
    expect(isStalled({ status: "failed", startedAt: 0 }, 99 * 60_000, 45)).toBe(false);
  });

  it("needs the user at gates, on failures and on pending input", () => {
    const card = (columnId: "plan_approval" | "implement" | "final_review", runState: "idle" | "running" | "failed") => ({
      columnId,
      runState,
      archived: false,
    });
    expect(needsYou(card("plan_approval", "idle"), false)).toBe(true);
    expect(needsYou(card("implement", "failed"), false)).toBe(true);
    expect(needsYou(card("implement", "running"), true)).toBe(true);
    expect(needsYou(card("implement", "running"), false)).toBe(false);
    expect(needsYou({ ...card("final_review", "idle"), archived: true }, false)).toBe(false);
  });
});

describe("delivery text", () => {
  it("prefers the spec's PR title", () => {
    expect(pullRequestTitle({ title: "Board" }, '---\npr_title: "feat: board"\n---')).toBe("feat: board");
    expect(pullRequestTitle({ title: "Board" }, undefined)).toBe("Board");
  });

  it("builds a body from the card's artifacts only", () => {
    const body = pullRequestBody({ number: 3, description: "Do it" }, "Report", {
      verdict: "APPROVE",
      findings: [],
    });
    expect(body).toBe("## Summary\n\nDo it\n\n## Implementation\n\nReport\n\n## Review\n\nVerdict: APPROVE (0 findings)\n\nTask Board card #3.");
  });

  it("reads PR numbers from GitHub URLs", () => {
    expect(pullRequestNumber("https://github.com/a/b/pull/42")).toBe(42);
    expect(pullRequestNumber("https://github.com/a/b/pull/42/files")).toBe(42);
    expect(pullRequestNumber("https://github.com/a/b")).toBeNull();
  });
});
