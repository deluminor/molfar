/** Pure sizing for year heatmaps that fill a measured container. */

export type HeatmapVariant = "compact" | "full";

export type HeatmapCellLayout = {
  cellPx: number;
  gapXPx: number;
  gapYPx: number;
  showMonthLabels: boolean;
  showLegend: boolean;
};

const DAYS_PER_WEEK = 7;
const MIN_CELL_PX = 2;
const MAX_CELL_COMPACT_PX = 18;
const MAX_CELL_FULL_PX = 14;
const MIN_GAP_PX = 1;
const MAX_GAP_PX = 6;
const FOOTER_PX = 16;
const MONTH_LABEL_PX = 14;
const SECTION_GAP_PX = 4;

export type HeatmapLayoutInput = {
  widthPx: number;
  heightPx: number;
  weekCount: number;
  variant: HeatmapVariant;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxCellForBox(
  widthPx: number,
  heightPx: number,
  weekCount: number,
  minGap: number,
): number {
  if (weekCount <= 0 || widthPx <= 0 || heightPx <= 0) return MIN_CELL_PX;
  const fromWidth = Math.floor(
    (widthPx - (weekCount - 1) * minGap) / weekCount,
  );
  const fromHeight = Math.floor(
    (heightPx - (DAYS_PER_WEEK - 1) * minGap) / DAYS_PER_WEEK,
  );
  return Math.min(fromWidth, fromHeight);
}

/** Vertical gap stays modest; horizontal gap absorbs leftover width so the grid fills. */
function expandGapY(
  available: number,
  cellPx: number,
): number {
  const leftover = available - DAYS_PER_WEEK * cellPx;
  if (leftover <= 0) return MIN_GAP_PX;
  return clamp(
    Math.floor(leftover / (DAYS_PER_WEEK - 1)),
    MIN_GAP_PX,
    MAX_GAP_PX,
  );
}

function expandGapX(
  available: number,
  cellPx: number,
  weekCount: number,
): number {
  if (weekCount <= 1) return MIN_GAP_PX;
  const leftover = available - weekCount * cellPx;
  if (leftover <= 0) return MIN_GAP_PX;
  return Math.max(MIN_GAP_PX, Math.floor(leftover / (weekCount - 1)));
}

/**
 * Choose cell/gap sizes so the week×day grid uses the container.
 * Prefer larger cells; leftover space becomes gap (capped), not empty margin.
 */
export function computeHeatmapCellLayout(
  input: HeatmapLayoutInput,
): HeatmapCellLayout {
  const { widthPx, heightPx, weekCount, variant } = input;
  const maxCell =
    variant === "full" ? MAX_CELL_FULL_PX : MAX_CELL_COMPACT_PX;
  const showLegend = variant === "full";

  if (weekCount <= 0 || widthPx <= 0 || heightPx <= 0) {
    return {
      cellPx: MIN_CELL_PX,
      gapXPx: MIN_GAP_PX,
      gapYPx: MIN_GAP_PX,
      showMonthLabels: false,
      showLegend,
    };
  }

  const wantMonths =
    variant === "full" ||
    heightPx >= FOOTER_PX + MONTH_LABEL_PX + SECTION_GAP_PX * 2 + 7 * 4;

  const reserved =
    FOOTER_PX +
    SECTION_GAP_PX +
    (wantMonths ? MONTH_LABEL_PX + SECTION_GAP_PX : 0);
  const gridHeight = Math.max(0, heightPx - reserved);
  const gridWidth = widthPx;

  const rawCell = maxCellForBox(
    gridWidth,
    gridHeight,
    weekCount,
    MIN_GAP_PX,
  );
  const cellPx = clamp(rawCell, MIN_CELL_PX, maxCell);

  const gapXPx = expandGapX(gridWidth, cellPx, weekCount);
  const gapYPx = expandGapY(gridHeight, cellPx);

  const showMonthLabels = wantMonths && cellPx >= 3;

  return {
    cellPx,
    gapXPx,
    gapYPx,
    showMonthLabels,
    showLegend,
  };
}
