import type { Session } from "@/domain/session/session";
import { sessionDisplayTitle } from "@/domain/session/title";
import type { ShownFamiliarSession } from "@/features/familiars/ui/FamiliarSessionList";
import { SessionPane } from "@/features/sessions/ui/SessionPane";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { useSharedPaneProps } from "../workspace-main/use-shared-pane-props";

export type FamiliarShownSessionInput = {
  /** A session the Familiar launched, open beside its chat. */
  session: Session | undefined;
  active: boolean;
  composerFocused: boolean;
  composerFocusToken: number;
  workspaceSwitchingSessionId: string | undefined;
};

export function useFamiliarShownSession(
  store: WorkspaceStore,
  input: FamiliarShownSessionInput,
): ShownFamiliarSession | undefined {
  const handlers = useWorkspaceHandlers();
  const paneProps = useSharedPaneProps(store, input.workspaceSwitchingSessionId);
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const projectTerminalFocused = useWorkspaceField(store, "projectTerminalFocused");
  const { session, active } = input;
  if (!session) return undefined;

  return {
    sessionId: session.id,
    title: sessionDisplayTitle(session.title, session.harness),
    pane: (
      <SessionPane
        {...paneProps}
        session={session}
        // The Familiar view covers the workspace, so a review opens
        // beside the chat rather than in a hidden tab.
        onOpenDiff={handlers.tabs.openMonoDiff}
        // The Familiar runs this session; handing it off or asking for a
        // second opinion belongs in its own tab.
        onSecondOpinion={undefined}
        onHandoff={undefined}
        visible={!!familiarViewId}
        focused={active && !projectTerminalFocused}
        inSplit={false}
        addToChatTarget={false}
        composerFocused={active && input.composerFocused && !projectTerminalFocused}
        composerFocusToken={input.composerFocusToken}
      />
    ),
  };
}
