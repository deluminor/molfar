import type { UpdaterPhase } from "./updater";

/** The app can stay open for days; launch-only checks would miss releases. */
export const UPDATE_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** A found or downloading update is already in front of the user; a probe would reset it. */
export function shouldRecheckForUpdate(phase: UpdaterPhase): boolean {
  return phase === "idle" || phase === "current" || phase === "error";
}
