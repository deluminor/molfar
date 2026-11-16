import { saveWorkspaceSnapshot } from "@/features/sessions/data/session-store";

// A layout that failed to load is still on disk. Writing the empty boot
// layout over it would lose it for good, so writes wait for a user edit.
let loadFailed = false;

export function snapshotLoadFailed(error: unknown): null {
  console.error("Workspace: could not load the saved layout; saving is paused until the next change", error);
  loadFailed = true;
  return null;
}

export function snapshotWritesBlocked(): boolean {
  return loadFailed;
}

export function releaseSnapshotWrites(): void {
  loadFailed = false;
}

export async function saveSnapshotUnlessBlocked(snapshot: unknown): Promise<void> {
  if (loadFailed) return;
  await saveWorkspaceSnapshot(snapshot);
}
