import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { setGrabbing, suppressTextSelection } from "@/shared/lib/drag";
import { legalDropTargets, type DropTarget } from "../model/transitions";
import type { BoardColumn, Card } from "../types/card";
import { columnFromPoint, edgeScrollStep } from "./board-drag-geometry";

const DRAG_THRESHOLD = 5;

/** Where the dragged card sat when the gesture began, for the floating ghost. */
export type DragOrigin = { left: number; top: number; width: number; dx: number; dy: number };

export type BoardDrag = {
  draggingId: string | null;
  /** Columns the dragged card may land in, keyed to the action the drop runs. */
  targets: Map<BoardColumn, DropTarget>;
  overColumn: BoardColumn | null;
  origin: DragOrigin | null;
  ghostRef: RefObject<HTMLDivElement | null>;
  start: (cardId: string, event: ReactPointerEvent<HTMLElement>) => void;
};

function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/**
 * Pointer-driven drag limited to the state machine's legal moves. Native HTML5
 * drag events never reach the webview: Tauri claims them for file drops.
 */
export function useBoardDrag(cards: readonly Card[], onDrop: (card: Card, target: DropTarget) => void): BoardDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<BoardColumn | null>(null);
  const [origin, setOrigin] = useState<DragOrigin | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ cards, onDrop });
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = { cards, onDrop };
  }, [cards, onDrop]);

  useEffect(() => () => cleanup.current?.(), []);

  const dragging = useMemo(() => cards.find((card) => card.id === draggingId), [cards, draggingId]);

  const targets = useMemo(() => {
    const map = new Map<BoardColumn, DropTarget>();
    if (!dragging) return map;
    for (const target of legalDropTargets(dragging)) map.set(target.column, target);
    return map;
  }, [dragging]);

  const start = useCallback((cardId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || cleanup.current) return;

    const handle = event.currentTarget;
    const scroller = handle.closest<HTMLElement>("[data-board-scroller]");
    const startX = event.clientX;
    const startY = event.clientY;
    let point = { x: startX, y: startY };
    let active = false;
    let over: BoardColumn | null = null;
    let scrollFrame = 0;
    let restoreSelection: (() => void) | null = null;

    const track = () => {
      const next = columnFromPoint(point.x, point.y);
      if (next === over) return;
      over = next;
      setOverColumn(next);
    };

    const autoScroll = () => {
      scrollFrame = 0;
      if (!scroller) return;
      const step = edgeScrollStep(point.x, scroller.getBoundingClientRect());
      if (step === 0) return;
      scroller.scrollLeft += step;
      track();
      scrollFrame = window.requestAnimationFrame(autoScroll);
    };

    const activate = () => {
      active = true;
      restoreSelection = suppressTextSelection();
      setGrabbing(true);
      const rect = handle.getBoundingClientRect();
      setOrigin({ left: rect.left, top: rect.top, width: rect.width, dx: point.x - startX, dy: point.y - startY });
      setDraggingId(cardId);
    };

    const onMove = (ev: PointerEvent) => {
      point = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.hypot(point.x - startX, point.y - startY) < DRAG_THRESHOLD) return;
        activate();
      }
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${point.x - startX}px, ${point.y - startY}px)`;
      track();
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(autoScroll);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !active) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.cancelAnimationFrame(scrollFrame);
      restoreSelection?.();
      if (active) setGrabbing(false);
      cleanup.current = null;
    };

    function finish(commit: boolean) {
      detach();
      if (!active) return;

      swallowNextClick();
      setDraggingId(null);
      setOverColumn(null);
      setOrigin(null);

      const column = commit ? columnFromPoint(point.x, point.y) : null;
      const card = latest.current.cards.find((entry) => entry.id === cardId);
      if (!column || !card || card.archived) return;
      const target = legalDropTargets(card).find((entry) => entry.column === column);
      if (target) latest.current.onDrop(card, target);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKey, true);
    cleanup.current = detach;
  }, []);

  return { draggingId, targets, overColumn, origin, ghostRef, start };
}
