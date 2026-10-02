import { describe, expect, it } from "vitest";
import type { Automation } from "../../automations/model/automations";
import type { SessionSummary } from "../../sessions/data/sessionStore";
import { buildHomeStatus, formatNextDueAt } from "./homeStatus";
import { formatLoad, formatPercent, formatProcessCount } from "./hostStats";
import {
  countEnabledAutomations,
  nextDueAutomationAt,
  pickRecentAutomations,
} from "./recentAutomations";
import {
  countSessionsUpdatedWithin,
  pickRecentSessions,
} from "./recentSessions";

function summary(
  partial: Partial<SessionSummary> & Pick<SessionSummary, "id" | "updatedAt">,
): SessionSummary {
  return {
    cwd: "/tmp/a",
    harness: "claude",
    model: "sonnet",
    runtimeMode: "supervised",
    title: partial.title ?? partial.id,
    createdAt: partial.updatedAt,
    ...partial,
  };
}

function automation(
  partial: Partial<Automation> & Pick<Automation, "id" | "createdAt">,
): Automation {
  return {
    name: partial.name ?? partial.id,
    prompt: "x",
    harness: "claude",
    model: "sonnet",
    cwd: "/tmp/a",
    workspaceMode: "current",
    reuseSession: false,
    runtimeMode: "supervised",
    triggerKind: "time",
    triggerEvent: "",
    scheduleKind: "daily",
    minute: 0,
    time: "09:00",
    dayOfWeek: 1,
    missedRunGraceMinutes: 0,
    enabled: true,
    nextRunAt: 0,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe("pickRecentSessions", () => {
  it("sorts by updatedAt, drops archived, and caps at the limit", () => {
    const rows = pickRecentSessions(
      [
        summary({ id: "old", updatedAt: 1, title: "Old" }),
        summary({ id: "new", updatedAt: 3, title: "New" }),
        summary({ id: "mid", updatedAt: 2, title: "Mid" }),
        summary({ id: "archived", updatedAt: 9, archived: true }),
      ],
      3,
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "mid", "old"]);
  });

  it("counts sessions updated within 24h", () => {
    const now = 1_000_000_000;
    expect(
      countSessionsUpdatedWithin(
        [
          summary({ id: "fresh", updatedAt: now - 1_000 }),
          summary({ id: "stale", updatedAt: now - 25 * 60 * 60 * 1000 }),
          summary({
            id: "archived",
            updatedAt: now,
            archived: true,
          }),
        ],
        now,
      ),
    ).toBe(1);
  });
});

describe("automations helpers", () => {
  it("picks the three newest by createdAt", () => {
    const rows = pickRecentAutomations(
      [
        automation({ id: "old", createdAt: 1, name: "Old" }),
        automation({ id: "new", createdAt: 4, name: "New" }),
        automation({ id: "mid", createdAt: 2, name: "Mid" }),
        automation({ id: "newer", createdAt: 3, name: "Newer" }),
      ],
      3,
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "newer", "mid"]);
  });

  it("counts enabled automations and finds the next due time", () => {
    const rows = [
      automation({
        id: "off",
        createdAt: 1,
        enabled: false,
        nextRunAt: 10,
      }),
      automation({ id: "later", createdAt: 2, nextRunAt: 50 }),
      automation({ id: "soon", createdAt: 3, nextRunAt: 20 }),
    ];
    expect(countEnabledAutomations(rows)).toBe(2);
    expect(nextDueAutomationAt(rows)).toBe(20);
  });
});

describe("buildHomeStatus", () => {
  it("aggregates sessions and automations into the Status card model", () => {
    const now = 1_000_000_000;
    const status = buildHomeStatus(
      [
        summary({ id: "a", updatedAt: now - 1_000 }),
        summary({ id: "b", updatedAt: now - 30 * 60 * 60 * 1000 }),
      ],
      [
        automation({ id: "on", createdAt: 1, nextRunAt: now + 60_000 }),
        automation({
          id: "off",
          createdAt: 2,
          enabled: false,
          nextRunAt: now + 1_000,
        }),
      ],
      now,
    );
    expect(status).toEqual({
      recentSessionCount: 1,
      enabledAutomationCount: 1,
      nextDueAt: now + 60_000,
    });
    expect(formatNextDueAt(status.nextDueAt, now)).toBe("in 1m");
    expect(formatNextDueAt(null)).toBe("—");
  });
});

describe("host format helpers", () => {
  it("formats percent, load, and process counts", () => {
    expect(formatPercent(58.4)).toBe("58%");
    expect(formatLoad(1.3)).toBe("1.30");
    expect(formatProcessCount(243)).toBe("243");
  });
});
