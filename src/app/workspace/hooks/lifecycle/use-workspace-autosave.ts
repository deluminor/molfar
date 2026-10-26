import { useEffect, useRef } from "react";
import type { Session } from "@/domain/session/session";
import type {
  DockSide,
  ProjectTerminalDock,
} from "@/features/projects/model/project-terminal";
import { reconcileProjectReturn } from "@/features/projects/model/project-return";
import {
  replaceInFlightSessions,
  saveWorkspaceSnapshot,
} from "@/features/sessions/data/session-store";
import {
  inFlightRefs,
  inFlightSnapshotKey,
  shouldWriteInFlightSnapshot,
} from "@/features/sessions/model/in-flight";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import {
  collectWorkspaceSnapshot,
  workspaceSnapshotKey,
} from "@/features/workspace/model/workspace-snapshot";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import { releaseSnapshotWrites, snapshotWritesBlocked } from "../../../model/workspace-snapshot-guard";
import type { ProjectReturn } from "./use-project-return-memory";

/** Records the running turns on change, so a crash can mark them interrupted; cleared once after a run. */
export function useInFlightSnapshot(sessions: Session[], tabs: WorkspaceTab[]): void {
  const inFlightSyncKey = useRef<string | null>(null);
  const sawInFlight = useRef(false);

  useEffect(() => {
    const refs = inFlightRefs(sessions, tabs);
    if (refs.length > 0) sawInFlight.current = true;
    const key = inFlightSnapshotKey(refs);
    if (
      !shouldWriteInFlightSnapshot(
        key,
        refs,
        inFlightSyncKey.current,
        sawInFlight.current,
      )
    ) {
      return;
    }
    inFlightSyncKey.current = key;
    void replaceInFlightSessions(refs).catch(() => undefined);
  }, [sessions, tabs]);
}

type WorkspaceSnapshotAutosaveInput = {
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  projectCwd: string;
  projectTerminals: ProjectTerminalDock[];
  lastDockSide: DockSide | null;
  windowTransfer: WindowTransferPayload | null;
  keepWorkspaceTab: (tab: WorkspaceTab) => boolean;
  worktreePath: string | undefined;
  navigationRevision: number;
  projectReturnRef: ProjectReturn["ref"];
};

/**
 * Saves the layout 250 ms after it changes; a moved window never overwrites the main one's.
 * After a failed boot load, the boot layout is not saved until it changes.
 */
export function useWorkspaceSnapshotAutosave({
  tabs,
  sessions,
  activeTabId,
  projectCwd,
  projectTerminals,
  lastDockSide,
  windowTransfer,
  keepWorkspaceTab,
  worktreePath,
  navigationRevision,
  projectReturnRef,
}: WorkspaceSnapshotAutosaveInput): void {
  const workspaceSyncKey = useRef<string | null>(null);
  const bootKey = useRef<string | null>(null);

  useEffect(() => {
    if (windowTransfer) return;
    const snapshot = collectWorkspaceSnapshot(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      reconcileProjectReturn({
        memory: projectReturnRef.current,
        tabs,
        sessions,
        activeTabId,
      }),
      projectTerminals,
      lastDockSide ?? undefined,
      keepWorkspaceTab,
    );
    const key = workspaceSnapshotKey(snapshot);
    bootKey.current ??= key;
    if (workspaceSyncKey.current === key) return;
    if (snapshotWritesBlocked()) {
      if (key === bootKey.current) return;
      releaseSnapshotWrites();
    }

    const timer = window.setTimeout(() => {
      workspaceSyncKey.current = key;
      void saveWorkspaceSnapshot(snapshot).catch((error: unknown) => {
        if (workspaceSyncKey.current === key) workspaceSyncKey.current = null;
        console.warn("Could not save the workspace layout", error);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    lastDockSide,
    windowTransfer,
    keepWorkspaceTab,
    worktreePath,
    navigationRevision,
    projectReturnRef,
  ]);
}
