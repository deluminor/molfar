import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { suppressTextSelection } from "../lib/drag";
import {
  loadPaneWidth,
  parsePaneWidth,
  savePaneWidth,
} from "../lib/pane-width-storage";

type Options = {
  min: number;
  direction?: "left" | "right";
  max: () => number;
  defaultWidth: number;
  initial: number;
  /** Persists the width in localStorage and follows changes from other windows. */
  storageKey?: string;
  onCommit?: (width: number) => void;
};

function clampTo(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Drag a pane's width by writing the DOM directly so React re-renders can't fight the cursor. */
export function useDragResize({
  direction = "right",
  min,
  max,
  defaultWidth,
  initial,
  storageKey,
  onCommit,
}: Options) {
  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const defaultRef = useRef(defaultWidth);
  defaultRef.current = defaultWidth;

  const clamp = useCallback((value: number) => {
    return clampTo(value, minRef.current, maxRef.current());
  }, []);

  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const [width, setWidth] = useState(() =>
    clamp((storageKey ? loadPaneWidth(storageKey) : null) ?? initial),
  );
  const [dragging, setDragging] = useState(false);
  const paneRef = useRef<HTMLElement | null>(null);
  const widthRef = useRef(width);
  const stopDrag = useRef<(() => void) | null>(null);

  const apply = (next: number) => {
    widthRef.current = next;
    const pane = paneRef.current;
    if (pane) pane.style.width = `${next}px`;
  };

  const setPaneRef = useCallback((el: HTMLElement | null) => {
    paneRef.current = el;
    if (el) el.style.width = `${widthRef.current}px`;
  }, []);

  const commit = (next: number) => {
    const value = clamp(next);
    apply(value);
    setWidth(value);

    const key = storageKeyRef.current;
    if (key) savePaneWidth(key, value);
    onCommitRef.current?.(value);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startW = widthRef.current;
    handle.setPointerCapture(pointerId);
    setDragging(true);
    const restoreSelection = suppressTextSelection();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.documentElement.classList.add("is-resizing");

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      apply(
        clamp(startW + (ev.clientX - startX) * (direction === "left" ? -1 : 1)),
      );
    };

    const stop = () => {
      if (stopDrag.current !== stop) return;
      stopDrag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      restoreSelection();
      document.body.style.cursor = previousCursor;
      document.documentElement.classList.remove("is-resizing");
      setDragging(false);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      commit(widthRef.current);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
    };

    stopDrag.current = stop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => () => stopDrag.current?.(), []);

  useEffect(() => {
    if (!storageKey) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || stopDrag.current) return;

      const stored = parsePaneWidth(event.newValue);
      if (stored == null) return;

      const value = clamp(stored);
      apply(value);
      setWidth(value);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, clamp]);

  const onDoubleClick = () => {
    commit(defaultRef.current);
  };

  return {
    width,
    dragging,
    setPaneRef,
    onPointerDown,
    onDoubleClick,
  };
}
