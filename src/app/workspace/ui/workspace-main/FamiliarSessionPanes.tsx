import { useCallback } from "react";
import { useStore } from "zustand";
import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import {
  type Familiar,
  familiarLook,
  isFamiliarSession,
} from "@/features/familiars/model/familiar";
import { SessionPane, type SessionPaneProps } from "@/features/sessions/ui/SessionPane";
import { FamiliarViewActions } from "../../../shell/TitleBar";
import { showFamiliarActivity } from "../../flows/familiars/familiar-overview";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import { shownFamiliarSession } from "../../store/familiars-slice";
import type { WorkspaceStore } from "../../store/types";
import type { SharedPaneProps } from "./types";

type Props = Pick<
  SessionPaneProps,
  "composerFocusToken" | "onOpenArtifact" | "onOpenDiff" | "onCommitChanges" | "onOpenFamiliarSession"
> & {
  store: WorkspaceStore;
  paneProps: SharedPaneProps;
  sessions: Session[];
  insetLayout: boolean;
  /** The Familiar in view. */
  familiar: Familiar | undefined;
  composerFocused: boolean;
  /** A launched session open beside the chat takes the focus from it. */
  shownSessionActive: boolean;
  activityTurnId: string | undefined;
  launchedSessions: SessionPaneProps["familiarLaunchedSessions"];
};

/** Each Familiar's chat, kept mounted and shown over the workspace while its Familiar is in view. */
export function FamiliarSessionPanes({
  store,
  paneProps,
  sessions,
  insetLayout,
  familiar,
  composerFocused,
  composerFocusToken,
  shownSessionActive,
  activityTurnId,
  launchedSessions,
  ...chatProps
}: Props) {
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const familiarOverviewOpen = useWorkspaceField(store, "familiarOverviewOpen");
  const projectTerminalFocused = useWorkspaceField(store, "projectTerminalFocused");
  const shownFamiliarSessionId = useStore(store, shownFamiliarSession);
  const { setFamiliarOverviewOpen, setFamiliarSettingsFor } = useWorkspaceActions(store);
  const onShowFamiliarActivity = useCallback(
    (sessionId: string, turnId: string, blocks: Block[]) =>
      showFamiliarActivity(store, sessionId, turnId, blocks),
    [store],
  );

  const onToggleOverview = () => setFamiliarOverviewOpen((open) => !open);
  const onOpenSettings = familiar ? () => setFamiliarSettingsFor(familiar.id) : undefined;

  return sessions
    .filter((session) => isFamiliarSession(session.id))
    .map((session) => {
      const visible = familiarViewId === session.id;
      const chatActive = visible && !projectTerminalFocused && !shownSessionActive;

      return (
        <div
          key={session.id}
          data-familiar-view={session.id}
          aria-hidden={!visible}
          inert={!visible || undefined}
          className={visible ? "absolute inset-0 flex h-full min-h-0 flex-col" : "hidden"}
        >
          {insetLayout && visible && familiar ? (
            <FamiliarViewActions
              name={familiarLook(familiar).name}
              overviewOpen={familiarOverviewOpen}
              onToggleOverview={onToggleOverview}
              onOpenSettings={onOpenSettings}
              // The overview header's row, so both share a centre line.
              className="absolute right-2.5 top-0 z-10 h-10"
            />
          ) : null}
          <SessionPane
            {...paneProps}
            session={session}
            visible={visible}
            focused={chatActive}
            inSplit={false}
            addToChatTarget={visible}
            composerFocused={chatActive && composerFocused}
            composerFocusToken={composerFocusToken}
            onShowFamiliarActivity={onShowFamiliarActivity}
            onOpenArtifact={chatProps.onOpenArtifact}
            onOpenDiff={chatProps.onOpenDiff}
            onCommitChanges={chatProps.onCommitChanges}
            familiarActivityTurnId={activityTurnId}
            onOpenFamiliarSession={chatProps.onOpenFamiliarSession}
            familiarLaunchedSessions={visible ? launchedSessions : undefined}
            openFamiliarSessionId={shownFamiliarSessionId}
            // The inset footer stays under a Familiar and shows its usage.
            familiarComposerUsage={!insetLayout}
          />
        </div>
      );
    });
}
