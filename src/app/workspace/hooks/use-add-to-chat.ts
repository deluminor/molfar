import { useEffect } from "react";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { applyAddToChatRequest } from "@/features/sessions/model/add-chat-to-workspace";
import { ADD_TO_CHAT_EVENT, type AddToChatRequest } from "@/features/sessions/model/quote-draft";
import { type InboxDeps, leaveOverlayViews } from "../flows/inbox/inbox-deps";

export type AddToChatDeps = InboxDeps & {
  tabsRef: { current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  projectCwdRef: { readonly current: string };
};

/**
 * Text added to chat from anywhere (a file, a diff, a search hit) lands in the
 * focused conversation, or a new one when no session pane takes it.
 */
export function useAddToChat(
  deps: AddToChatDeps,
  fallbackCwd: string | undefined,
  defaultRuntimeMode: RuntimeMode | undefined,
): void {
  useEffect(() => {
    const openSessionForAddToChat = (event: Event) => {
      const detail = (event as CustomEvent<AddToChatRequest>).detail;
      if (!detail?.text) return;

      // Match notes/inbox: leave the overlay surface so the chat is visible.
      const { setSearchViewOpen, setProjectTerminalFocused, setTabs } = deps.store.getState();
      setSearchViewOpen(false);
      leaveOverlayViews(deps);
      deps.setSidebarTab("sessions");
      setProjectTerminalFocused(false);
      deps.focusComposer();

      const result = applyAddToChatRequest({
        sessions: deps.sessionsRef.current,
        tabs: deps.tabsRef.current,
        activeTabId: deps.activeTabIdRef.current,
        projectCwd: deps.projectCwdRef.current,
        fallbackCwd,
        defaultRuntimeMode,
        text: detail.text,
        mode: detail.mode,
      });
      // null ⇒ a mounted session pane already owns add-to-chat (draft insert).
      if (!result) return;

      deps.sessionsRef.current = result.sessions;
      deps.tabsRef.current = result.tabs;
      deps.setSessions(result.sessions);
      setTabs(result.tabs);
      deps.selectTab(result.activeTabId);
    };

    window.addEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
    return () => window.removeEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
  }, [deps, fallbackCwd, defaultRuntimeMode]);
}
