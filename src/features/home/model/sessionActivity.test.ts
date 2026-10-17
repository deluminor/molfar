import { describe, expect, it } from "vitest";
import {
  activityLevel,
  buildActivityYear,
  countSessionsByDay,
  localDateKey,
} from "./sessionActivity";

describe("localDateKey", () => {
  it("formats a local calendar day", () => {
    const ms = new Date(2026, 2, 5, 14, 30).getTime();
    expect(localDateKey(ms)).toBe("2026-03-05");
  });
});

describe("activityLevel", () => {
  it("maps session counts onto intensity bands", () => {
    expect(activityLevel(0)).toBe(0);
    expect(activityLevel(1)).toBe(1);
    expect(activityLevel(3)).toBe(2);
    expect(activityLevel(6)).toBe(3);
    expect(activityLevel(7)).toBe(4);
  });
});

describe("countSessionsByDay", () => {
  it("counts only the target year and ignores bad timestamps", () => {
    const counts = countSessionsByDay(
      [
        new Date(2026, 0, 1, 9).getTime(),
        new Date(2026, 0, 1, 18).getTime(),
        new Date(2025, 11, 31, 23).getTime(),
        Number.NaN,
      ],
      2026,
    );
    expect(counts.get("2026-01-01")).toBe(2);
    expect(counts.size).toBe(1);
  });
});

describe("buildActivityYear", () => {
  it("builds a Sunday-aligned grid with activity levels", () => {
    const jan1 = new Date(2026, 0, 1, 12).getTime();
    const jan2 = new Date(2026, 0, 2, 12).getTime();
    const grid = buildActivityYear([jan1, jan1, jan2], 2026, jan2 + 1);

    expect(grid.year).toBe(2026);
    expect(grid.totalSessions).toBe(3);
    expect(grid.totalActiveDays).toBe(2);
    expect(grid.weeks.length).toBeGreaterThan(50);

    const flat = grid.weeks.flat().filter((cell) => cell.inYear);
    expect(flat).toHaveLength(365);
    expect(flat.find((cell) => cell.dateKey === "2026-01-01")?.level).toBe(2);
    expect(flat.find((cell) => cell.dateKey === "2026-01-02")?.level).toBe(1);
  });

  it("zeros future days within the year", () => {
    const now = new Date(2026, 5, 15, 12).getTime();
    const future = new Date(2026, 5, 20, 12).getTime();
    const grid = buildActivityYear([future], 2026, now);
    const cell = grid.weeks.flat().find((item) => item.dateKey === "2026-06-20");
    expect(cell).toMatchObject({ count: 0, level: 0, future: true });
    expect(grid.totalSessions).toBe(0);
  });
});
