import { describe, expect, it } from "vitest";
import { computeHeatmapCellLayout } from "./heatmap-layout";

describe("computeHeatmapCellLayout", () => {
  it("returns minimums for empty or zero boxes", () => {
    expect(
      computeHeatmapCellLayout({
        widthPx: 0,
        heightPx: 100,
        weekCount: 53,
        variant: "compact",
      }),
    ).toMatchObject({ cellPx: 3, gapXPx: 2, gapYPx: 2 });
  });

  it("grows cells and keeps the grid within a wide short Home card", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 420,
      heightPx: 96,
      weekCount: 53,
      variant: "compact",
    });
    expect(layout.cellPx).toBeGreaterThanOrEqual(5);
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(gridW).toBeLessThanOrEqual(420);
    expect(layout.gapXPx).toBeLessThanOrEqual(4);
    expect(layout.gapYPx).toBeLessThanOrEqual(4);
  });

  it("caps cell size and horizontal gap so weeks do not balloon", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 1200,
      heightPx: 220,
      weekCount: 53,
      variant: "compact",
    });
    expect(layout.cellPx).toBe(16);
    expect(layout.gapXPx).toBeLessThanOrEqual(4);
    expect(layout.gapYPx).toBeLessThanOrEqual(4);
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(gridW).toBeLessThanOrEqual(1200);
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
    expect(layout.cellPx).toBeGreaterThanOrEqual(10);
    expect(layout.cellPx).toBeLessThanOrEqual(22);
  });

  it("full variant fills width even when measured height is short", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 700,
      heightPx: 40,
      weekCount: 53,
      variant: "full",
    });
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(layout.cellPx).toBeGreaterThanOrEqual(10);
    expect(gridW).toBeGreaterThanOrEqual(Math.floor(700 * 0.92));
    expect(gridW).toBeLessThanOrEqual(700);
    expect(layout.showMonthLabels).toBe(true);
    expect(layout.showLegend).toBe(true);
  });

  it("full variant stretches across a Usage card width", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 720,
      heightPx: 200,
      weekCount: 53,
      variant: "full",
    });
    const gridW = 53 * layout.cellPx + 52 * layout.gapXPx;
    expect(layout.cellPx).toBeGreaterThanOrEqual(11);
    expect(gridW).toBeGreaterThanOrEqual(Math.floor(720 * 0.95));
    expect(gridW).toBeLessThanOrEqual(720);
    expect(layout.gapXPx).toBeLessThanOrEqual(8);
  });

  it("respects height before width when the card is short", () => {
    const layout = computeHeatmapCellLayout({
      widthPx: 800,
      heightPx: 56,
      weekCount: 53,
      variant: "compact",
    });
    const gridH = 7 * layout.cellPx + 6 * layout.gapYPx;
    expect(gridH).toBeLessThanOrEqual(56 - 18);
  });
});
