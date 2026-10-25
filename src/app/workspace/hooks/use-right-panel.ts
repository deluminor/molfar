import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  loadRightPanelOpen,
  loadRightPanelTab,
  loadRightPanelWidth,
  RIGHT_PANEL_WIDTH_DEFAULT,
  RIGHT_PANEL_WIDTH_MAX,
  RIGHT_PANEL_WIDTH_MIN,
  type RightPanelTab,
  saveRightPanelOpen,
  saveRightPanelTab,
  saveRightPanelWidth,
} from "@/features/settings/model/appearance";
import { useDragResize } from "@/shared/hooks/use-drag-resize";
import { beginLayoutTransition } from "@/shared/lib/layout-transition";

const OPEN_DURATION_MS = 240;
const CLOSE_DURATION_MS = 200;

/** The inset layout's project tools beside the card: open/tab/width state. */
export function useRightPanel() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(loadRightPanelOpen);
  const [tab, setTab] = useState<RightPanelTab>(loadRightPanelTab);
  // A closed panel keeps its contents until it has slid out.
  const [closing, setClosing] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const show = useCallback((next: RightPanelTab) => {
    setTab(next);
    saveRightPanelTab(next);
    setOpen(true);
    setClosing(false);
    saveRightPanelOpen(true);
  }, []);

  const toggle = useCallback(() => {
    const next = !openRef.current;
    openRef.current = next;
    saveRightPanelOpen(next);
    setOpen(next);
    setClosing(!next);
  }, []);

  // Its handle sits on the left edge, so dragging left widens it.
  const resize = useDragResize({
    direction: "left",
    min: RIGHT_PANEL_WIDTH_MIN,
    max: () => Math.min(RIGHT_PANEL_WIDTH_MAX, Math.floor(window.innerWidth * 0.5)),
    defaultWidth: RIGHT_PANEL_WIDTH_DEFAULT,
    initial: loadRightPanelWidth(),
    onCommit: saveRightPanelWidth,
  });

  const paneRef = useRef<HTMLDivElement | null>(null);
  const setPaneRef = resize.setPaneRef;
  const setPane = useCallback(
    (el: HTMLDivElement | null) => {
      paneRef.current = el;
      setPaneRef(el);
    },
    [setPaneRef],
  );

  return { host, setHost, open, tab, closing, setClosing, show, toggle, resize, paneRef, setPane };
}

/**
 * The panel grows from the card's edge and pushes the workspace; its contents
 * keep their full width and ride its edge. A reversal mid-slide starts from
 * wherever the width currently is.
 */
export function useRightPanelSlide(
  open: boolean,
  closing: boolean,
  shown: boolean,
  paneRef: { readonly current: HTMLDivElement | null },
  setClosing: (closing: boolean) => void,
): void {
  const animation = useRef<Animation | null>(null);
  const endTransition = useRef<(() => void) | null>(null);
  const wasOpen = useRef(open);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the panel toggles; `shown` is read at that moment
  useLayoutEffect(() => {
    const toggled = wasOpen.current !== open;
    wasOpen.current = open;
    const pane = paneRef.current;
    const content = pane?.firstElementChild;
    if (!toggled || !pane || !(content instanceof HTMLElement)) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animate = shown && typeof pane.animate === "function" && !reduceMotion;
    const current = pane.getBoundingClientRect().width;
    const from = animation.current || !open ? current : 0;
    animation.current?.cancel();
    animation.current = null;
    endTransition.current?.();
    endTransition.current = null;
    if (!animate) {
      content.style.width = "";
      if (!open) setClosing(false);
      return;
    }

    // The committed width; a running slide only overrides it. Only the width
    // is pinned: the column still stretches the contents to full height, so
    // the panel's scrolling content stays put while it slides.
    const full = parseFloat(pane.style.width) || pane.offsetWidth;
    content.style.width = `${full}px`;
    endTransition.current = beginLayoutTransition();
    const slide = pane.animate([{ width: `${from}px` }, { width: `${open ? full : 0}px` }], {
      duration: open ? OPEN_DURATION_MS : CLOSE_DURATION_MS,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      fill: "forwards",
    });
    animation.current = slide;
    slide.onfinish = () => {
      if (animation.current !== slide) return;
      if (!open) {
        setClosing(false);
        return;
      }
      slide.cancel();
      animation.current = null;
      endTransition.current?.();
      endTransition.current = null;
      content.style.width = "";
    };
  }, [open]);

  // A slid-out panel holds its last frame until it is hidden, in the same
  // commit, so it never flashes back in place.
  useLayoutEffect(() => {
    if (closing || open) return;
    animation.current?.cancel();
    animation.current = null;
    endTransition.current?.();
    endTransition.current = null;
    const content = paneRef.current?.firstElementChild;
    if (content instanceof HTMLElement) content.style.width = "";
  }, [closing, open, paneRef]);
}
