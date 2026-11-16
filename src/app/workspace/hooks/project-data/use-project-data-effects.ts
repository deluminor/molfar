import { useCallback, useEffect, useState } from "react";
import { REMOTE_HISTORY_UPDATED } from "@/features/connections/model/connections";
import { prefetchProjectFiles } from "@/features/files/model/file-index";
import { listSessionsByProject } from "@/features/sessions/data/session-store";
import { refreshProjectHistory } from "../../flows/session-history/refresh-history";
import type { WorkspaceStore } from "../../store/types";

/** Re-renders when a remote project's history changes, so remote tab titles follow it. */
export function useRemoteHistoryRerender(): void {
  const [, refreshRemoteTabTitles] = useState(0);

  useEffect(() => {
    const updated = () => refreshRemoteTabTitles((value) => value + 1);
    window.addEventListener(REMOTE_HISTORY_UPDATED, updated);
    return () => window.removeEventListener(REMOTE_HISTORY_UPDATED, updated);
  }, []);
}

/** Loads the sidebar project's history whenever the sidebar moves to another project; returns the refresher. */
export function useProjectHistory(
  store: WorkspaceStore,
  sidebarCwd: string,
  sidebarCwdRef: { readonly current: string },
): (cwd: string) => Promise<void> {
  const refreshHistory = useCallback(
    (cwd: string) =>
      refreshProjectHistory(store, cwd, {
        list: listSessionsByProject,
        sidebarCwd: () => sidebarCwdRef.current,
      }),
    [store, sidebarCwdRef],
  );

  useEffect(() => {
    void refreshHistory(sidebarCwd);
  }, [sidebarCwd, refreshHistory]);

  return refreshHistory;
}

/** Indexes the files of the folder git and the file picker follow. */
export function useProjectFilePrefetch(gitCwd: string): void {
  useEffect(() => {
    prefetchProjectFiles(gitCwd);
  }, [gitCwd]);
}
