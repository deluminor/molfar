import { projectKey } from "@/shared/lib/paths";
import { clearProjectLogo } from "./project-logos";
import { clearProjectChatBackground } from "./chat-background";
import {
  clearProjectChatBackgroundSetting,
  rebaseProjectChatBackgroundSetting,
} from "./project-chat-background";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import { deleteSession, listSessionsByProject } from "@/features/sessions/data/session-store";
import {
  clearTabGroupSettings,
  rebaseProjectTabGroupSettings,
} from "@/features/workspace/model/tab-groups";
import {
  rebaseProjectGroupAssignment,
  removeProjectGroupAssignment,
} from "./project-groups";
import { rebaseSessionFolderSettings } from "@/features/sessions/model/session-folders";
import { clearProjectProviders, rebaseProjectProviders } from "@/features/sessions/model/project-providers";
import {
  clearProjectSidebarTab,
  rebaseProjectSidebarTab,
} from "@/features/settings/model/project-sidebar-tab";

/** Saved chats filed under this project, so the confirm prompt can count them. */
export async function projectSessionCount(path: string): Promise<number> {
  const sessions = await listSessionsByProject(path).catch(() => []);
  return sessions.length;
}

/** Everything we persist for a project: saved chats plus its rail appearance. */
export async function removeProjectData(path: string): Promise<void> {
  const normalized = normalizeProjectPath(path);
  const key = projectKey(normalized);
  const sessions = await listSessionsByProject(normalized).catch(() => []);
  for (const session of sessions) {
    await deleteSession(session.id).catch(() => undefined);
  }
  // Drops the copied image from app data; the localStorage entry goes with it.
  await clearProjectLogo(key).catch(() => undefined);
  await clearProjectChatBackground(key).catch(() => undefined);
  clearProjectChatBackgroundSetting(key);
  clearTabGroupSettings(key);
  removeProjectGroupAssignment(normalized);
  clearProjectProviders(key);
  clearProjectSidebarTab(normalized);
}

/** Move local project settings after the filesystem resolver finds a rename. */
export function rebaseProjectData(from: string, to: string): void {
  const oldKey = projectKey(normalizeProjectPath(from));
  const newKey = projectKey(normalizeProjectPath(to));
  rebaseProjectTabGroupSettings(from, to);
  rebaseProjectGroupAssignment(from, to);
  rebaseProjectChatBackgroundSetting(oldKey, newKey);
  rebaseSessionFolderSettings(from, to);
  rebaseProjectProviders(oldKey, newKey);
  rebaseProjectSidebarTab(from, to);
}
