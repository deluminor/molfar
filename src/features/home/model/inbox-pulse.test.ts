import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { inboxPulse } from "./inbox-pulse";

function item(number: number, updatedAt: string): InboxItem {
  return {
    kind: "issue",
    number,
    title: `Item ${number}`,
    url: `https://example.test/${number}`,
    state: "open",
    updatedAt,
    labels: [],
    assignees: [],
    draft: false,
    repo: "acme/app",
    projectPath: "/p",
    provider: "github",
  };
}

describe("inboxPulse", () => {
  it("is clear when there are no items", () => {
    expect(inboxPulse([], () => true)).toEqual({ attentionCount: 0, rows: [] });
  });

  it("puts unseen items first, newest next, capped at the limit", () => {
    const items = [
      item(1, "2026-01-01T00:00:00Z"),
      item(2, "2026-01-03T00:00:00Z"),
      item(3, "2026-01-02T00:00:00Z"),
    ];
    const pulse = inboxPulse(items, (entry) => entry.title === "Item 1", 2);

    expect(pulse.attentionCount).toBe(1);
    expect(pulse.rows.map((row) => [row.title, row.unseen])).toEqual([
      ["Item 1", true],
      ["Item 2", false],
    ]);
    expect(pulse.rows[0]).toMatchObject({ meta: "acme/app #1" });
  });
});
