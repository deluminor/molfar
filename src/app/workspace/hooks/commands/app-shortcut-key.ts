import { invoke } from "@tauri-apps/api/core";
import { handleEditorFindKey } from "@/features/files/editor/editor-search";
import { resolveAppShortcut } from "@/features/settings/model/app-shortcuts";
import type { CommandDeps } from "./command-deps";

/** The editor's find chord, unless a view covers the editor or a drag is under the pointer. */
export function handleEditorFind(deps: CommandDeps, event: KeyboardEvent): boolean {
  const open = deps.surfaces();
  if (open.search || open.inbox || open.notes || open.automations) return false;
  if (event.target instanceof Element && event.target.closest("[data-session-drop], [data-agent-tab]")) return false;
  if (!handleEditorFindKey(event)) return false;
  event.stopPropagation();
  return true;
}

/** App-wide shortcuts (new window, open project, search, settings…). */
export function handleAppShortcutKey(deps: CommandDeps, event: KeyboardEvent): void {
  const shortcut = resolveAppShortcut(event);
  if (!shortcut) return;
  if (
    shortcut === "App: Search" &&
    event.target instanceof Element &&
    event.target.closest(".molfar-terminal") &&
    event.ctrlKey &&
    !event.metaKey
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const { run } = deps;
  const a = deps.actions.current;
  if (shortcut === "App: New Window") run("new_window", () => void invoke("open_new_window"));
  else if (shortcut === "App: Open Project") run("open_project", () => void a.pickProject());
  else if (shortcut === "App: Toggle Sidebar") run("toggle_sidebar", a.onToggleSidebar);
  else if (shortcut === "App: Toggle Session Sidebar") run("toggle_session_sidebar", a.onToggleSessionSidebar);
  else if (shortcut === "App: Toggle Familiar") run("toggle_familiar", a.onToggleFamiliar);
  else if (shortcut === "App: Go to File") run("go_to_file", a.onGoToFile);
  else if (shortcut === "App: Command Palette") run("open_command_palette", a.onOpenCommandPalette);
  else if (shortcut === "View: Reload") run("reload", a.onReload);
  else if (shortcut === "App: Search") run("open_search", a.onOpenSearch);
  else if (shortcut === "App: Settings") run("open_settings", () => a.openSettings());
  else if (shortcut === "App: Find in Files") run("find_in_project", a.onFindInProject);
}
