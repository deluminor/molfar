import { invoke } from "@tauri-apps/api/core";
import { sessionNeedsInput } from "@/domain/session/session-state";
import type { Session } from "@/domain/session/session";

let lastCount = -1;

/** Push the pending-approval count to the macOS Dock badge. */
export function syncDockBadge(sessions: Session[]): void {
  let count = 0;
  for (const session of sessions) {
    if (sessionNeedsInput(session)) count++;
  }
  if (count === lastCount) return;
  lastCount = count;
  void invoke("set_dock_badge", { count }).catch(() => {});
}
