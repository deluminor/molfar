import type { HostSession } from "@/domain/remote/protocol";
import type { Session } from "@/domain/session/session";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionState } from "@/features/connections/model/remote-session-state";

/**
 * Mirrors host snapshots into their local shell sessions, created once for the workspace.
 * A repeated snapshot object is skipped; a missing one resets the shell to a new remote session.
 */
export function createRemoteSnapshotSync(setSessions: (update: (current: Session[]) => Session[]) => void) {
  const lastSnapshot = new Map<string, HostSession>();

  return (shellId: string, snapshot?: HostSession) => {
    if (!snapshot) {
      lastSnapshot.delete(shellId);
      setSessions((current) =>
        current.map((entry) =>
          entry.id === shellId ? { ...entry, title: "New remote session", blocks: [], busy: false } : entry,
        ),
      );
      return;
    }
    if (lastSnapshot.get(shellId) === snapshot) return;
    lastSnapshot.set(shellId, snapshot);
    setSessions((current) => {
      const shell = current.find((entry) => entry.id === shellId);
      if (!shell) return current;
      const project = remoteProjectFor(shell.cwd);
      if (!project) return current;
      return current.map((entry) => (entry.id === shellId ? remoteSessionState(entry, snapshot, project) : entry));
    });
  };
}
