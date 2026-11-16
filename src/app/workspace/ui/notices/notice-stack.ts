const NOTICE_TOP = 12;
const NOTICE_GAP = 8;

/** Where a top-right notice starts, below the shown notices stacked above it. */
export function noticeStackOffset(heightsAbove: readonly number[]): number {
  return heightsAbove.reduce(
    (top, height) => (height ? top + height + NOTICE_GAP : top),
    NOTICE_TOP,
  );
}
