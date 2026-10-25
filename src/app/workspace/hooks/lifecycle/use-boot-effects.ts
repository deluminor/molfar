import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
  findFamiliar,
  loadOpenFamiliar,
  saveOpenFamiliar,
} from "@/features/familiars/model/familiar";
import {
  lastProjectPath,
  looksLikeProject,
  rememberProject,
} from "@/features/projects/model/recents";
import type { WindowTransferPayload } from "../../../model/window-transfer";
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

/** The Familiar open when the app last closed opens again, once; a moved window keeps what it carried. */
export function useReopenFamiliar(
  familiarsEnabled: boolean,
  onOpenFamiliar: (familiarId: string) => unknown,
  windowTransfer: WindowTransferPayload | null,
): void {
  const reopenedFamiliar = useRef(false);

  useEffect(() => {
    if (reopenedFamiliar.current) return;
    reopenedFamiliar.current = true;
    if (windowTransfer || !familiarsEnabled) return;
    const familiarId = loadOpenFamiliar();
    if (familiarId && findFamiliar(familiarId)) void onOpenFamiliar(familiarId);
    else if (familiarId) saveOpenFamiliar(undefined);
  }, [familiarsEnabled, onOpenFamiliar, windowTransfer]);
}
