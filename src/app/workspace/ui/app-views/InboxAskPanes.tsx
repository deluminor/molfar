import type { Session } from "@/domain/session/session";
import { SessionPane } from "@/features/sessions/ui/SessionPane";
import { SessionSurface } from "@/features/sessions/ui/SessionSurface";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { useSharedPaneProps } from "../workspace-main/use-shared-pane-props";

type Props = {
  store: WorkspaceStore;
  sessions: readonly Session[];
  composerFocused: boolean;
  composerFocusToken: number;
  workspaceSwitchingSessionId: string | undefined;
};

/** Inbox Ask chats, kept mounted out of view and portalled into the inbox's Ask host while it shows them. */
export function InboxAskPanes({
  store,
  sessions,
  composerFocused,
  composerFocusToken,
  workspaceSwitchingSessionId,
}: Props) {
  const inboxViewOpen = useWorkspaceField(store, "inboxViewOpen");
  const inboxAskPortal = useWorkspaceField(store, "inboxAskPortal");
  const paneProps = useSharedPaneProps(store, workspaceSwitchingSessionId);

  return (
    <div className="hidden" aria-hidden>
      {sessions
        .filter((session) => session.inboxAsk)
        .map((session) => {
          const visible = inboxViewOpen && inboxAskPortal?.sessionId === session.id;

          return (
            <SessionSurface key={session.id} host={visible ? inboxAskPortal.host : undefined}>
              <SessionPane
                {...paneProps}
                session={session}
                visible={visible}
                focused={visible}
                inSplit={false}
                composerFocused={composerFocused}
                composerFocusToken={composerFocusToken}
              />
            </SessionSurface>
          );
        })}
    </div>
  );
}
