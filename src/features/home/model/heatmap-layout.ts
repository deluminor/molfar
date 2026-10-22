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
const MIN_CELL_PX = 3;
const MAX_CELL_COMPACT_PX = 16;
/** Full Usage cards are wide — allow larger day cells than Home minicharts. */
const MAX_CELL_FULL_PX = 22;
const MIN_GAP_PX = 2;
const MAX_GAP_COMPACT_PX = 4;
/** Full may open week gaps more so the grid reaches ~100% card width. */
const MAX_GAP_FULL_PX = 8;
const FOOTER_PX = 18;
const MONTH_LABEL_PX = 14;
const SECTION_GAP_PX = 6;

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

function cellFromWidth(
  widthPx: number,
  weekCount: number,
  minGap: number,
): number {
  if (weekCount <= 0 || widthPx <= 0) return MIN_CELL_PX;
  return Math.floor((widthPx - (weekCount - 1) * minGap) / weekCount);
}

/** Keep day gaps modest so weeks never look vertically stretched. */
function expandGapY(
  available: number,
  cellPx: number,
  maxGap: number,
): number {
  const leftover = available - DAYS_PER_WEEK * cellPx;
  if (leftover <= 0) return MIN_GAP_PX;
  return clamp(
    Math.floor(leftover / (DAYS_PER_WEEK - 1)),
    MIN_GAP_PX,
    maxGap,
  );
}

/**
 * Distribute leftover width into week gaps up to maxGap.
 * Compact keeps a tight cap; full opens wider so the grid fills the card.
 */
function expandGapX(
  available: number,
  cellPx: number,
  weekCount: number,
  maxGap: number,
): number {
  if (weekCount <= 1) return MIN_GAP_PX;
  const leftover = available - weekCount * cellPx;
  if (leftover <= 0) return MIN_GAP_PX;
  return clamp(
    Math.floor(leftover / (weekCount - 1)),
    MIN_GAP_PX,
    maxGap,
  );
}

/**
 * Choose cell/gap sizes so the week×day grid uses the container.
 * Compact: fit inside Home card height (leftover may center in UI).
 * Full: width-first so Usage Activity stretches edge-to-edge even when
 * the parent height is content-sized (avoids chicken-egg collapse).
 */
export function computeHeatmapCellLayout(
  input: HeatmapLayoutInput,
): HeatmapCellLayout {
  const { widthPx, heightPx, weekCount, variant } = input;
  const isFull = variant === "full";
  const maxCell = isFull ? MAX_CELL_FULL_PX : MAX_CELL_COMPACT_PX;
  const maxGap = isFull ? MAX_GAP_FULL_PX : MAX_GAP_COMPACT_PX;
  const showLegend = isFull;

  if (weekCount <= 0 || widthPx <= 0) {
    return {
      cellPx: MIN_CELL_PX,
      gapXPx: MIN_GAP_PX,
      gapYPx: MIN_GAP_PX,
      showMonthLabels: false,
      showLegend,
    };
  }

  // Compact needs a real height box; full can size from width alone.
  if (!isFull && heightPx <= 0) {
    return {
      cellPx: MIN_CELL_PX,
      gapXPx: MIN_GAP_PX,
      gapYPx: MIN_GAP_PX,
      showMonthLabels: false,
      showLegend,
    };
  }

  const wantMonths =
    isFull ||
    heightPx >= FOOTER_PX + MONTH_LABEL_PX + SECTION_GAP_PX * 2 + 7 * 5;

  const reserved =
    FOOTER_PX +
    SECTION_GAP_PX +
    (wantMonths ? MONTH_LABEL_PX + SECTION_GAP_PX : 0);
  const gridHeight = Math.max(0, heightPx - reserved);
  const gridWidth = widthPx;

  let cellPx: number;
  if (isFull) {
    // Width-first: do not let a short content-sized height collapse cells.
    cellPx = clamp(
      cellFromWidth(gridWidth, weekCount, MIN_GAP_PX),
      MIN_CELL_PX,
      maxCell,
    );
  } else {
    const rawCell = maxCellForBox(
      gridWidth,
      gridHeight,
      weekCount,
      MIN_GAP_PX,
    );
    cellPx = clamp(rawCell, MIN_CELL_PX, maxCell);
  }

  const gapXPx = expandGapX(gridWidth, cellPx, weekCount, maxGap);
  const gapYPx = isFull
    ? clamp(Math.round(cellPx * 0.28), MIN_GAP_PX, maxGap)
    : expandGapY(gridHeight, cellPx, maxGap);

  const showMonthLabels = wantMonths && cellPx >= 4;

  return {
    cellPx,
    gapXPx,
    gapYPx,
    showMonthLabels,
    showLegend,
  };
}
