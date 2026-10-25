import { keybindingPressed, matchCustomKeybinding } from "@/features/settings/model/settings";
import { getUpdatePrompt } from "@/features/updates/model/update-prompt";
import {
  shouldHandleListNavigation,
  tabCommand,
  tabCommandForKeybinding,
  tabCommandKeybinding,
} from "@/features/workspace/model/tab-keys";
import { getAppDialog } from "@/shared/lib/app-dialog";
import type { CommandDeps, WorkspaceActions } from "./command-deps";

type TabCommand = NonNullable<ReturnType<typeof tabCommand>>;

const LIST_NAVIGATION = new Set<unknown>([
  "prev-session",
  "next-session",
  "prev-session-in-tab",
  "next-session-in-tab",
  "prev-project",
  "next-project",
]);
const LIST_BLOCKING_TARGET =
  'input, textarea, select, [contenteditable="true"], .cm-editor, .molfar-terminal, [role="dialog"], [data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]';
const PICKER =
  "[data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]";

/** Session and project stepping stays out of fields, pickers and covering views. */
function listNavigationAllowed(deps: CommandDeps, target: Element | null): boolean {
  const open = deps.surfaces();
  return shouldHandleListNavigation({
    blockedTarget: Boolean(target?.closest(LIST_BLOCKING_TARGET)),
    emptyComposerTarget: Boolean(target?.matches('textarea[data-composer-empty="true"]')),
    surfaceOpen:
      open.search ||
      open.inbox ||
      open.notes ||
      open.automations ||
      open.settings ||
      open.filePicker ||
      open.whatsNew ||
      Boolean(getUpdatePrompt()) ||
      Boolean(getAppDialog()),
  });
}

/** Whether a focused field or terminal keeps the chord for itself. */
function leftToTarget(deps: CommandDeps, cmd: TabCommand, event: KeyboardEvent, target: Element | null): boolean {
  if (
    target?.closest(".molfar-terminal") &&
    event.ctrlKey &&
    !event.metaKey &&
    (cmd === "back" || cmd === "forward" || /Mac|iPhone|iPad/.test(navigator.platform))
  ) {
    return true;
  }
  if ((cmd === "split-right" || cmd === "split-down") && target?.closest(".cm-editor")) return true;
  const inPicker = target?.closest(PICKER);
  return (
    !!inPicker &&
    typeof cmd === "object" &&
    "activate" in cmd &&
    !(deps.surfaces().insetLayout && target?.closest("[data-app-search]"))
  );
}

function runTabCommand(deps: CommandDeps, cmd: TabCommand): void {
  const { run } = deps;
  const a: WorkspaceActions = deps.actions.current;
  const simple: Partial<Record<string, [string, () => void]>> = {
    new: ["new", a.onNewFocused],
    "close-others": ["close-others", a.onCloseOtherTabs],
    "close-all": ["close-all", a.onCloseAllTabs],
    close: ["close", a.onCloseFocused],
    next: ["next", a.onNext],
    prev: ["prev", a.onPrev],
    "cycle-next": ["next", a.onNext],
    "cycle-prev": ["prev", a.onPrev],
    back: ["back", a.onVisitBack],
    forward: ["forward", a.onVisitForward],
    "split-right": ["split-right", () => a.onSplit("right")],
    "split-down": ["split-down", () => a.onSplit("down")],
    "new-terminal": ["new-terminal", a.onNewTerminal],
    "new-terminal-tab": ["new-terminal-tab", a.onNewTerminalTab],
    "toggle-terminal": ["toggle-terminal", a.onToggleProjectTerminal],
    "prev-session": ["prev-session", () => a.onNavigateSessionList(-1)],
    "next-session": ["next-session", () => a.onNavigateSessionList(1)],
    "prev-session-in-tab": ["prev-session-in-tab", () => a.onNavigateSessionList(-1, true)],
    "next-session-in-tab": ["next-session-in-tab", () => a.onNavigateSessionList(1, true)],
    "prev-project": ["prev-project", () => a.onNavigateProjectList(-1)],
    "next-project": ["next-project", () => a.onNavigateProjectList(1)],
  };
  if (typeof cmd === "string") {
    const entry = simple[cmd];
    if (entry) run(entry[0], entry[1]);
    return;
  }
  if ("focus" in cmd) run(`focus-${cmd.focus}`, () => a.onFocusDir(cmd.focus));
  else if ("activate" in cmd) run(`activate-${cmd.activate}`, () => a.onActivate(cmd.activate));
}

/** Handles a workspace tab chord (new, close, cycle, split, step sessions); false when the key is not one. */
export function handleTabCommandKey(deps: CommandDeps, event: KeyboardEvent): boolean {
  const customCommand = matchCustomKeybinding(event);
  const cmd = customCommand ? tabCommandForKeybinding(customCommand, event) : tabCommand(event);
  if (!cmd || !keybindingPressed(tabCommandKeybinding(cmd), event, !customCommand)) return false;

  if (cmd === "archive-session") {
    if (!event.repeat) deps.actions.current.onArchiveFocusedSession(event);
    return true;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (LIST_NAVIGATION.has(cmd) && !listNavigationAllowed(deps, target)) return true;
  if (leftToTarget(deps, cmd, event, target)) return true;

  event.preventDefault();
  event.stopPropagation();
  runTabCommand(deps, cmd);
  return true;
}
