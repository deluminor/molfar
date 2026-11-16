import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { openFindInActiveEditor } from "@/features/files/editor/editor-search";
import { NOTIFICATION_CLICK_EVENT } from "@/features/notifications/model/notifications";
import { saveAutosave } from "@/features/settings/model/settings";
import { boardNoticeCard } from "@/features/task-board/services/notify";
import { runUpdateFlow } from "@/features/updates/model/updater";
import { IS_MAC } from "@/shared/lib/platform";
import { invoke } from "@tauri-apps/api/core";
import type { CommandDeps, WorkspaceActions } from "./command-deps";
import { zoomUi } from "./ui-zoom";

type Commands = Record<string, (actions: WorkspaceActions) => void>;

/** Menu commands debounced against the key handler that fires the same command. */
const RUN_COMMANDS: Record<string, [string, (a: WorkspaceActions) => void]> = {
  new_tab: ["new", (a) => a.onNewFocused()],
  close_other_tabs: ["close-others", (a) => a.onCloseOtherTabs()],
  close_all_tabs: ["close-all", (a) => a.onCloseAllTabs()],
  close_tab: ["close", (a) => a.onCloseFocused()],
  next_tab: ["next", (a) => a.onNext()],
  prev_tab: ["prev", (a) => a.onPrev()],
  back_tab: ["back", (a) => a.onVisitBack()],
  forward_tab: ["forward", (a) => a.onVisitForward()],
  split_right: ["split-right", (a) => a.onSplit("right")],
  split_down: ["split-down", (a) => a.onSplit("down")],
  new_terminal: ["new-terminal", (a) => a.onNewTerminal()],
  new_terminal_tab: ["new-terminal-tab", (a) => a.onNewTerminalTab()],
  toggle_terminal: ["toggle-terminal", (a) => a.onToggleProjectTerminal()],
  focus_left: ["focus-left", (a) => a.onFocusDir("left")],
  focus_right: ["focus-right", (a) => a.onFocusDir("right")],
  focus_up: ["focus-up", (a) => a.onFocusDir("up")],
  focus_down: ["focus-down", (a) => a.onFocusDir("down")],
  toggle_sidebar: ["toggle_sidebar", (a) => a.onToggleSidebar()],
  toggle_session_sidebar: ["toggle_session_sidebar", (a) => a.onToggleSessionSidebar()],
  go_to_file: ["go_to_file", (a) => a.onGoToFile()],
  open_command_palette: ["open_command_palette", (a) => a.onOpenCommandPalette()],
  reload: ["reload", (a) => a.onReload()],
};

/** Menu commands that run at once. */
const DIRECT_COMMANDS: Commands = {
  open_project: (a) => void a.pickProject(),
  open_search: (a) => a.onOpenSearch(),
  open_inbox: (a) => a.onOpenInbox(),
  open_notes: (a) => a.onOpenNotes(),
  open_settings: (a) => a.openSettings(),
  check_for_updates: () => void runUpdateFlow(true),
  sidebar_opacity: (a) => a.openSettings("appearance"),
  find_in_project: (a) => a.onFindInProject(),
  find: () => openFindInActiveEditor(),
  open_model_picker: () => window.dispatchEvent(new Event("open_model_picker")),
  zoom_in: () => zoomUi("zoom-in"),
  zoom_out: () => zoomUi("zoom-out"),
  zoom_reset: () => zoomUi("zoom-reset"),
};

/** Every window hears a notification click; only the one holding the session acts. */
function openNotification(deps: CommandDeps, sessionId: string): void {
  const boardCard = boardNoticeCard(sessionId);
  const handled = boardCard ? deps.isMainWindow() : deps.sessions().some((s) => s.id === sessionId);
  if (!handled) return;

  const win = getCurrentWindow();
  // Windows leaves a minimized window minimized when it is only focused.
  void win
    .unminimize()
    .then(() => win.setFocus())
    .catch(() => {});
  if (boardCard) deps.actions.current.onOpenBoardCard(boardCard);
  else deps.actions.current.onOpenApprovalSession(sessionId);
}

/** Native menu and tray commands. */
export function useMenuCommands(deps: CommandDeps): void {
  useEffect(() => {
    const { actions, run } = deps;
    const unlisten: Array<Promise<() => void>> = [
      ...Object.entries(RUN_COMMANDS).map(([event, [name, command]]) =>
        listen(event, () => run(name, () => command(actions.current))),
      ),
      ...Object.entries(DIRECT_COMMANDS).map(([event, command]) =>
        listen(event, () => command(actions.current)),
      ),
      listen<boolean>("toggle_autosave", ({ payload }) => {
        const saved = saveAutosave(payload);
        if (saved !== payload && IS_MAC) void invoke("autosave_set_enabled", { enabled: saved });
      }),
      listen<string>(NOTIFICATION_CLICK_EVENT, ({ payload }) => openNotification(deps, payload)),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => {
        for (const fn of fns) fn();
      });
    };
  }, [deps]);
}
