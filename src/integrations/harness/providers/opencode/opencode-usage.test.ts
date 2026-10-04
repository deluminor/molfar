import { describe, expect, it } from "vitest";
import { parseOpencodeGoUsage } from "./opencode-usage";

describe("parseOpencodeGoUsage", () => {
  it("maps rolling/weekly/monthly windows with reset times", () => {
    const limits = parseOpencodeGoUsage({
      usage: {
        rolling: {
          status: "ok",
          percent: 42,
          resetsAt: "2026-09-16T16:27:38.287Z",
        },
        weekly: { status: "ok", percent: 30, resetsAt: "2026-09-23T00:00:00Z" },
        monthly: {
          status: "ok",
          percent: 12,
          resetsAt: "2026-10-16T00:00:00Z",
        },
      },
    });
    expect(limits.provider).toBe("opencode");
    expect(limits.session?.usedPercent).toBe(42);
    expect(limits.session?.windowMinutes).toBe(300);
    expect(limits.weekly?.usedPercent).toBe(30);
    expect(limits.weekly?.windowMinutes).toBe(10_080);
    expect(limits.monthly?.usedPercent).toBe(12);
    expect(limits.monthly?.windowMinutes).toBe(43_200);
    expect(limits.session?.resetsAt).toBe(
      Date.parse("2026-09-16T16:27:38.287Z"),
    );
  });

  it("drops non-ok windows instead of claiming usage", () => {
    const limits = parseOpencodeGoUsage({
      usage: {
        rolling: { status: "ok", percent: 5, resetsAt: null },
        weekly: { status: "expired", percent: 50, resetsAt: null },
        monthly: { percent: 50, resetsAt: null },
      },
    });
    expect(limits.session?.usedPercent).toBe(5);
    expect(limits.weekly).toBeNull();
    expect(limits.monthly).toBeNull();
  });
});
