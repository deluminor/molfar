import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyDockGridStyle,
  isVerticalDock,
  type ProjectTerminalDock,
} from "@/features/projects/model/project-terminal";
import { sameProjectPath } from "@/features/projects/model/recents";
import { beginLayoutTransition } from "@/shared/lib/layout-transition";

export type DockSlideOptions = {
  dock: ProjectTerminalDock | undefined;
  projectCwd: string;
  familiarCovers: boolean;
  insetLayout: boolean;
  /** The dock a size drag paints, read at the moment of the drag; none while a Familiar covers the workspace. */
  paintTarget(): ProjectTerminalDock | undefined;
  commitSize(size: number): void;
};

/**
 * Lays out the project terminal dock in its grid and slides it open and shut
 * in the inset layout. A size drag paints the grid directly and is committed
 * once on release.
 */
export function useDockSlide({ dock, projectCwd, familiarCovers, insetLayout, paintTarget, commitSize }: DockSlideOptions) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragSize = useRef<number | null>(null);
  const wasOpen = useRef<{ path: string; open: boolean } | null>(null);
  const animation = useRef<{ key: string; stop: () => void } | null>(null);
  // The project whose dock stays rendered while it slides shut.
  const [closing, setClosing] = useState<string | null>(null);
  const closingShown =
    closing != null && !familiarCovers && !!dock && !dock.open && sameProjectPath(closing, projectCwd);

  const paintSize = useCallback(
    (size: number) => {
      const target = paintTarget();
      const el = gridRef.current;
      if (!target || !el) return;
      dragSize.current = size;
      applyDockGridStyle(el, target.side, size);
    },
    [paintTarget],
  );
  const commitDragSize = useCallback(
    (size: number) => {
      dragSize.current = null;
      commitSize(size);
    },
    [commitSize],
  );

  useLayoutEffect(() => {
    if (familiarCovers) dragSize.current = null;
    if (dragSize.current != null) return;
    const el = gridRef.current;
    if (!el) return;

    const open = !!dock?.open && !familiarCovers;
    const side = dock && (open || closingShown) ? dock.side : null;
    const size = dock?.size ?? 0;
    // Only a dock opening or closing in place slides; a project switch or a
    // familiar covering the workspace shows or hides it at once.
    const previous = wasOpen.current;
    const inPlace = !!previous && sameProjectPath(previous.path, projectCwd);
    wasOpen.current = { path: projectCwd, open };
    const key = side ? `${open ? "open" : "close"}:${side}:${size}` : "";
    // Unrelated dock updates, like a terminal retitling itself, leave a
    // running slide alone.
    if (inPlace && animation.current?.key === key) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animates = insetLayout && !reduceMotion && typeof el.animate === "function";
    // Render the dock once more so it can slide out; the grid keeps its
    // track until then.
    if (animates && inPlace && previous.open && !open && dock && !familiarCovers) {
      setClosing(projectCwd);
      return;
    }

    const host = el.querySelector<HTMLElement>(":scope > [data-dock-shown]");
    const vertical = side ? isVerticalDock(side) : true;
    // A reversal mid-slide starts from wherever the track currently is.
    const rect = host?.getBoundingClientRect();
    const current = rect ? (vertical ? rect.height : rect.width) : 0;
    const reversing = !!animation.current;
    animation.current?.stop();
    animation.current = null;
    applyDockGridStyle(el, side, size);

    const opening = open && inPlace && (!previous.open || reversing);
    const closingNow = !open && !!side;
    if (!side || !animates || !(opening || closingNow)) return;
    const section = host?.firstElementChild;
    if (!host || !(section instanceof HTMLElement)) return;

    // The terminal keeps its full size and rides the moving edge, so it fits
    // once instead of on every frame.
    const property = vertical ? "gridTemplateRows" : "gridTemplateColumns";
    const leading = side === "top" || side === "left";
    host.style.display = "flex";
    host.style.flexDirection = vertical ? "column" : "row";
    host.style.justifyContent = leading ? "flex-end" : "flex-start";
    section.style.flexShrink = "0";
    if (vertical) section.style.height = `${size}px`;
    else section.style.width = `${size}px`;

    const track = (px: number) => (leading ? `${px}px minmax(0, 1fr)` : `minmax(0, 1fr) ${px}px`);
    const from = reversing ? current : opening ? 0 : size;
    const endTransition = beginLayoutTransition();
    const slide = el.animate([{ [property]: track(from) }, { [property]: track(opening ? size : 0) }], {
      duration: opening ? 240 : 200,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      fill: "forwards",
    });
    // Mounting the terminal can hold up the next frame; the slide starts
    // once that frame is out, not partway through.
    slide.pause();
    const start = requestAnimationFrame(() => slide.play());
    const stop = () => {
      cancelAnimationFrame(start);
      slide.onfinish = null;
      slide.cancel();
      host.style.display = "";
      host.style.flexDirection = "";
      host.style.justifyContent = "";
      section.style.flexShrink = "";
      section.style.height = "";
      section.style.width = "";
      endTransition();
      if (animation.current?.stop === stop) animation.current = null;
      if (closingNow) setClosing(null);
    };
    // A closed dock holds its last frame until it is no longer rendered.
    slide.onfinish = opening ? stop : () => setClosing(null);
    animation.current = { key, stop };
  }, [dock, closingShown, familiarCovers, insetLayout, projectCwd]);

  useEffect(() => () => animation.current?.stop(), []);

  return { gridRef, closingShown, paintSize, commitSize: commitDragSize };
}
