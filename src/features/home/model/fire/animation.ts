import { FIRE_MAX_DPR, FIRE_MAX_FRAME_STEP_MS } from "./constants";
import type { FireMotionState } from "./types";

export function shouldAnimateFire(state: FireMotionState): boolean {
  if (state.hidden || state.reducedMotion || !state.onScreen) return false;

  return state.width > 0 && state.height > 0;
}

export function fireCanvasSize(
  width: number,
  height: number,
  devicePixelRatio: number,
): { width: number; height: number; ratio: number } {
  const ratio = Math.min(FIRE_MAX_DPR, devicePixelRatio || 1);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    ratio,
  };
}

/** Advances animation time, clamping long gaps (sleep, tab switches) to one step. */
export function advanceFireTime(seconds: number, elapsedMs: number): number {
  const step = Math.min(Math.max(0, elapsedMs), FIRE_MAX_FRAME_STEP_MS) / 1000;

  return seconds + step;
}
