import { invoke } from "@tauri-apps/api/core";
import { sessionNeedsInput, type Session } from "../../sessions/model/session";

let lastCount = -1;
let sessionCount = 0;
let boardCount = 0;

function push(): void {
  const count = sessionCount + boardCount;
  if (count === lastCount) return;
  lastCount = count;
  void invoke("set_dock_badge", { count }).catch(() => {});
}

/** Push the pending-approval count to the macOS Dock badge. */
export function syncDockBadge(sessions: Session[]): void {
  let count = 0;
  for (const session of sessions) {
    if (sessionNeedsInput(session)) count++;
  }
  sessionCount = count;
  push();
}

/** Task Board cards waiting on the user join the Dock badge. */
export function syncBoardDockBadge(count: number): void {
  boardCount = count;
  push();
}
