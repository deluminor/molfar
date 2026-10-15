import { useCallback, useMemo, useState, type DragEvent } from "react";
import { legalDropTargets, type DropTarget } from "../model/transitions";
import type { BoardColumn, Card } from "../types/card";

const DRAG_TYPE = "application/x-molfar-task-card";

export type BoardDrag = {
  draggingId: string | null;
  /** Columns the dragged card may land in, keyed to the action the drop runs. */
  targets: Map<BoardColumn, DropTarget>;
  start: (cardId: string, event: DragEvent) => void;
  end: () => void;
  over: (column: BoardColumn, event: DragEvent) => void;
  drop: (column: BoardColumn, event: DragEvent) => void;
};

/**
 * Native drag-and-drop limited to the state machine's legal moves. A drop
 * calls `onDrop` with the same action a button would run.
 */
export function useBoardDrag(
  cards: readonly Card[],
  onDrop: (card: Card, target: DropTarget) => void,
): BoardDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragging = useMemo(() => cards.find((card) => card.id === draggingId), [cards, draggingId]);

  const targets = useMemo(() => {
    const map = new Map<BoardColumn, DropTarget>();
    if (!dragging) return map;
    for (const target of legalDropTargets(dragging)) map.set(target.column, target);
    return map;
  }, [dragging]);

  const start = useCallback((cardId: string, event: DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, cardId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(cardId);
  }, []);

  const end = useCallback(() => setDraggingId(null), []);

  const over = useCallback(
    (column: BoardColumn, event: DragEvent) => {
      if (!targets.has(column)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [targets],
  );

  const drop = useCallback(
    (column: BoardColumn, event: DragEvent) => {
      const target = targets.get(column);
      setDraggingId(null);
      if (!target || !dragging) return;
      event.preventDefault();
      onDrop(dragging, target);
    },
    [targets, dragging, onDrop],
  );

  return { draggingId, targets, start, end, over, drop };
}
