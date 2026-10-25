import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import {
  lastProjectPath,
  looksLikeProject,
  rememberProject,
} from "@/features/projects/model/recents";
import type { WorkspaceStore } from "../../store/types";
import { useWorkspaceActions } from "../use-workspace-actions";
import type { WorkspaceSessions } from "../use-workspace-sessions";

/** The first launch opens the home folder when it looks like a project; blank chats move there. */
export function useDefaultProject(
  store: WorkspaceStore,
  setSessions: WorkspaceSessions["setSessions"],
): void {
  const { setProjectCwd, setRecents } = useWorkspaceActions(store);

  useEffect(() => {
    if (lastProjectPath()) return;
    void invoke<string>("default_cwd")
      .then((cwd) => {
        if (!looksLikeProject(cwd)) return;
        setProjectCwd(cwd);
        setRecents((prev) => (prev.length > 0 ? prev : rememberProject(cwd)));
        setSessions((prev) =>
          prev.map((s) => (s.cwd === "~" ? { ...s, cwd } : s)),
        );
      })
      .catch(() => {});
  }, [setSessions]);
}
