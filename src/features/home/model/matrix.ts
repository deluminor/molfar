export const MATRIX_GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789";

/** Nominal cadence the original stepped loop used (ms). Speeds are calibrated to this. */
export const MATRIX_STEP_MS = 100;

export type MatrixColumn = {
  /** Continuous row of the leading glyph; negative while waiting above the canvas. */
  head: number;
  /** Rows advanced per MATRIX_STEP_MS. */
  speed: number;
  length: number;
};

type Random = () => number;

function spawn(rows: number, random: Random): MatrixColumn {
  return {
    head: -Math.floor(random() * rows * 1.5),
    speed: 0.12 + random() * 0.73,
    length: 8 + Math.floor(random() * Math.max(8, rows * 0.6)),
  };
}

/** Fresh columns staggered above the viewport. */
export function createColumns(
  count: number,
  rows: number,
  random: Random = Math.random,
): MatrixColumn[] {
  return Array.from({ length: count }, () => spawn(rows, random));
}

/**
 * Advance drops by elapsed time so the rain stays smooth under requestAnimationFrame.
 * `deltaMs` is clamped to 200 ms so a long pause does not teleport columns while
 * still absorbing occasional frame-rate dips.
 */
export function advanceColumns(
  columns: readonly MatrixColumn[],
  rows: number,
  deltaMs = MATRIX_STEP_MS,
  random: Random = Math.random,
): MatrixColumn[] {
  const step = Math.min(200, Math.max(0, deltaMs)) / MATRIX_STEP_MS;
  return columns.map((column) => {
    const head = column.head + column.speed * step;
    return head - column.length > rows
      ? spawn(rows, random)
      : { ...column, head };
  });
}

/** Only animate while the page is visible and the user allows motion. */
export function shouldAnimateMatrix(
  reducedMotion: boolean,
  hidden: boolean,
): boolean {
  return !reducedMotion && !hidden;
}

export function randomGlyph(random: Random = Math.random): string {
  return MATRIX_GLYPHS[Math.floor(random() * MATRIX_GLYPHS.length)];
}

/**
 * Smooth fade-in multiplier for columns that just entered the viewport.
 * Returns 0→1 over the first ~4 visible rows so new streams don't pop in.
 */
export function columnFadeIn(head: number): number {
  if (head <= 0) return 0;
  return Math.min(1, head / 4);
}
