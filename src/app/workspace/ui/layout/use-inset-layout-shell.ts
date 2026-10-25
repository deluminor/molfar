import { useLayoutEffect, useState } from "react";
import { applyInsetLayout } from "@/features/settings/model/appearance";

/** Applies the inset layout setting and keeps the shell's rail width in step; returns the rail host setter. */
export function useInsetLayoutShell(
  insetLayout: boolean,
): (host: HTMLDivElement | null) => void {
  const [insetRailHost, setInsetRailHost] = useState<HTMLDivElement | null>(
    null,
  );

  useLayoutEffect(() => {
    applyInsetLayout(insetLayout);
  }, [insetLayout]);
  // The title bar's navigation spans the open rail, so its tabs line up with
  // the card. Written straight to the shell to follow a rail drag per frame.
  useLayoutEffect(() => {
    const host = insetRailHost;
    const shell = host?.closest<HTMLElement>(".inset-shell");
    if (!host || !shell) return;
    const sync = () =>
      shell.style.setProperty("--inset-rail-width", `${host.offsetWidth}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--inset-rail-width");
    };
  }, [insetRailHost]);

  return setInsetRailHost;
}
