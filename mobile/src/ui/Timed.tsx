import { logDebug } from "../utils/logger";
import { Profiler, type ReactNode } from "react";

/** Renders slower than this are logged. */
const SLOW_MS = 8;

/** Off unless asked for: start Metro with EXPO_PUBLIC_RENDER_TIMING=1. */
const ENABLED = __DEV__ && process.env.EXPO_PUBLIC_RENDER_TIMING === "1";

/**
 * Dev only: logs how long `children` took to render when slow, as
 * structured render events in the Metro log, to find what makes a screen slow
 * to arrive. Renders the children alone in a release build.
 */
export function Timed({ id, children }: { id: string; children: ReactNode }) {
  if (!ENABLED) return children;
  return (
    <Profiler
      id={id}
      onRender={(name, phase, actual) => {
        if (actual > SLOW_MS)
          logDebug("ui.render", { name, phase, durationMs: Math.round(actual) });
      }}
    >
      {children}
    </Profiler>
  );
}
