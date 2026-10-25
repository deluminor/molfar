import { flushSync } from "react-dom";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { rememberOpenedFile, resolveFileOpenRequest } from "@/features/files/model/file-index";
import type { EditorNavigation, FileOpenOptions } from "@/features/search/model/search";
import { planTitle } from "@/features/sessions/model/plan";
import { loadFileTabMode } from "@/features/settings/model/settings";
import {
  newEditorWorkspaceTab,
  newFileTab,
  newPlanTab,
  openEditorTab,
  openWorkspaceFile,
} from "@/features/workspace/model/layout";
import type { FileDeps } from "./file-deps";

function navigateEditor(deps: FileDeps, path: string, navigation?: EditorNavigation): void {
  if (!navigation) return;
  deps.editorNavigationToken.current += 1;
  deps.store.getState().setEditorNavigation({ path, ...navigation, token: deps.editorNavigationToken.current });
}

/** Opens a file as its own workspace tab, reusing the preview tab unless pinned. */
function openAsWorkspaceTab(
  deps: FileDeps,
  file: ReturnType<typeof newFileTab>,
  projectCwd: string,
  pin: boolean,
): void {
  // Built once: the updater may run twice in StrictMode.
  const created = newEditorWorkspaceTab(pin ? file : { ...file, preview: true });
  let target: { tabId: string; paneId?: string } | undefined;
  // Select inside the updater, not from `tabsRef`: two opens resuming
  // before a render would otherwise both miss the preview and append
  // twice. flushSync runs the updater now so `target` is set below.
  flushSync(() => {
    deps.store.getState().setTabs((prev) => {
      const result = openWorkspaceFile(
        prev,
        file,
        created,
        (tabs, tab) => deps.insertBesideActive(tabs, tab, projectCwd),
        pin,
      );
      target = result;
      return result.tabs;
    });
  });
  if (target?.paneId) deps.activateTab(target.tabId, target.paneId);
  else if (target) deps.selectTab(target.tabId);
  deps.store.getState().setProjectTerminalFocused(false);
  deps.setComposerFocused(false);
}

/** Opens a file beside the active tab's conversation, or as a workspace tab. */
export async function openFile(
  deps: FileDeps,
  path: string,
  navigation?: EditorNavigation,
  options?: FileOpenOptions,
): Promise<void> {
  const fileCwd = deps.gitCwd();
  const fileProjectCwd = deps.sidebarCwd();
  const resolved = await resolveFileOpenRequest(fileCwd, path, options);
  rememberOpenedFile(fileCwd, resolved);
  const tab = deps.tabsRef.current.find((entry) => entry.id === deps.activeTabIdRef.current);
  if (!tab) return;

  const file = newFileTab(resolved, fileCwd, false, undefined, fileProjectCwd);
  const pin = !!options?.pin;
  if (loadFileTabMode() === "workspace") {
    openAsWorkspaceTab(deps, file, fileProjectCwd, pin);
    navigateEditor(deps, resolved, navigation);
    return;
  }

  deps.store.getState().setTabs((prev) =>
    prev.map((entry) => {
      if (entry.id !== tab.id) return entry;
      const focusedSession = deps.sessionsRef.current.find((session) => session.id === entry.focusedId);
      return openEditorTab(entry, file, {
        split: focusedSession?.blocks.length === 0 ? "left" : "right",
        pin,
      });
    }),
  );
  navigateEditor(deps, resolved, navigation);
  deps.setComposerFocused(false);
}

/** Opens a plan from the transcript as an editor tab beside the conversation. */
export function openPlan(deps: FileDeps, sessionId: string, blockId: string): void {
  const tab = deps.tabsRef.current.find((entry) => entry.id === deps.activeTabIdRef.current);
  const session = deps.sessionsRef.current.find((entry) => entry.id === sessionId);
  const block = session?.blocks.find((entry) => entry.id === blockId);
  if (!tab || !session || !block) return;

  const file = {
    ...newPlanTab(session.id, block.id, planTitle(block.text), sessionWorkCwd(session)),
    ...(session.worktreeCwd ? { projectCwd: session.cwd } : {}),
  };
  deps.store.getState().setTabs((prev) =>
    prev.map((entry) => (entry.id === tab.id ? openEditorTab(entry, file) : entry)),
  );
  deps.setComposerFocused(false);
}
