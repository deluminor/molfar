import { BOARD_COLUMNS } from "../constants/columns";
import type { BoardColumn } from "../types/card";

const EDGE_ZONE = 56;
const MAX_SCROLL_STEP = 18;

export function columnFromPoint(x: number, y: number): BoardColumn | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-board-column]");
  const column = element?.dataset.boardColumn;
  return BOARD_COLUMNS.find((entry) => entry === column) ?? null;
}

/** Horizontal scroll speed while the pointer rests near a board edge; faster closer in. */
export function edgeScrollStep(x: number, rect: Pick<DOMRect, "left" | "right">): number {
  const fromLeft = x - rect.left;
  const fromRight = rect.right - x;
  if (fromLeft < EDGE_ZONE) return -Math.ceil(MAX_SCROLL_STEP * (1 - Math.max(fromLeft, 0) / EDGE_ZONE));
  if (fromRight < EDGE_ZONE) return Math.ceil(MAX_SCROLL_STEP * (1 - Math.max(fromRight, 0) / EDGE_ZONE));
  return 0;
}
