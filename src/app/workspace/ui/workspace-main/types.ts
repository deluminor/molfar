import type { SessionPaneProps } from "@/features/sessions/ui/SessionPane";

/** The session pane props every pane in the workspace shares; each loop adds its own. */
export type SharedPaneProps = Omit<
  SessionPaneProps,
  | "session"
  | "reviewUndoLocked"
  | "visible"
  | "focused"
  | "addToChatTarget"
  | "inSplit"
  | "composerFocused"
  | "composerFocusToken"
  | "onShowFamiliarActivity"
  | "familiarActivityTurnId"
  | "onOpenFamiliarSession"
  | "familiarLaunchedSessions"
  | "openFamiliarSessionId"
  | "familiarComposerUsage"
  | "onOpenArtifact"
  | "onCommitChanges"
  | "onPaneDragStart"
  | "transcriptPool"
>;
