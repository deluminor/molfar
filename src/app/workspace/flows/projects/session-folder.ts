import type { Session } from "@/domain/session/session";
import { remoteSessionFor } from "@/features/connections/model/connections";
import { isRemoteProjectPath, looksLikeProject } from "@/features/projects/model/recents";
import {
  loadSessionFolders,
  placeSessionInFolder,
  type SessionFolderTarget,
  saveSessionFolders,
} from "@/features/sessions/model/session-folders";

/** Files a project session into one of the project's session folders. */
export function placeInFolder(sessions: Session[], sessionId: string, target: SessionFolderTarget): void {
  const source = sessions.find((session) => session.id === sessionId);
  if (!source || !looksLikeProject(source.cwd)) return;
  const folders = loadSessionFolders(source.cwd);
  if (target.kind === "existing" && !folders.some((folder) => folder.id === target.folderId)) return;

  saveSessionFolders(
    source.cwd,
    placeSessionInFolder(
      folders,
      isRemoteProjectPath(source.cwd) ? (remoteSessionFor(sessionId) ?? sessionId) : sessionId,
      target,
    ),
  );
}
