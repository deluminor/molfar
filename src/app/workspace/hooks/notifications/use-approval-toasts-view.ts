import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import { hiddenApprovalNotices } from "@/features/notifications/model/approval-toast";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

type ApprovalToastsViewInput = {
  promptableSessions: Session[];
  activeTabId: string;
  tabs: WorkspaceTab[];
  composerFocused: boolean;
  /** The Familiar covering the workspace; its own approvals show in its chat. */
  familiarViewId: string | null;
};

/** Approvals waiting in chats the user cannot see right now. */
export function useApprovalToastsView({
  promptableSessions,
  activeTabId,
  tabs,
  composerFocused,
  familiarViewId,
}: ApprovalToastsViewInput): ReturnType<typeof hiddenApprovalNotices> {
  const familiarCovers = !!familiarViewId;

  return useMemo(
    () =>
      hiddenApprovalNotices(
        familiarViewId
          ? promptableSessions.filter((session) => session.id !== familiarViewId)
          : promptableSessions,
        familiarCovers ? "" : activeTabId,
        tabs,
        composerFocused,
      ),
    [
      promptableSessions,
      activeTabId,
      tabs,
      composerFocused,
      familiarViewId,
      familiarCovers,
    ],
  );
}
