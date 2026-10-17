import { describe, expect, it } from "vitest";
import { computeHeatmapCellLayout } from "./heatmapLayout";

/** Floor division leaves at most weekCount-1 unused pixels. */
function weekRemainder(weekCount: number): number {
  return weekCount;
}

describe("computeHeatmapCellLayout", () => {
  it("returns minimums for empty or zero boxes", () => {
    expect(
      computeHeatmapCellLayout({
        widthPx: 0,
        heightPx: 100,
        weekCount: 53,
        variant: "compact",
      }),
    ).toMatchObject({ cellPx: 2, gapXPx: 1, gapYPx: 1 });
  });

  it("grows cells and fills width on a wide short Home card", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 420,
      heightPx: 96,
      weekCount: 53,
      variant: "compact",
    });
    expect(layout.cellPx).toBeGreaterThanOrEqual(6);
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(gridW).toBeLessThanOrEqual(420);
    expect(420 - gridW).toBeLessThan(weekRemainder(53));
  });

  it("caps cell size and fills leftover width with gap", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 1200,
      heightPx: 220,
      weekCount: 53,
      variant: "compact",
    });
    expect(layout.cellPx).toBe(18);
    expect(layout.gapXPx).toBeGreaterThan(1);
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(1200 - gridW).toBeLessThan(weekRemainder(53));
  });

  it("shows month labels on full variant when space allows", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 700,
      heightPx: 160,
      weekCount: 53,
      variant: "full",
    });
    expect(layout.showMonthLabels).toBe(true);
    expect(layout.showLegend).toBe(true);
    expect(layout.cellPx).toBeLessThanOrEqual(14);
  });

  it("respects height before width when the card is short", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 800,
      heightPx: 56,
      weekCount: 53,
      variant: "compact",
    });
    const gridH = 7 * layout.cellPx + 6 * layout.gapYPx;
    expect(gridH).toBeLessThanOrEqual(56 - 16);
  });
});
