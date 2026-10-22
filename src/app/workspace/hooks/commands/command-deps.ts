import type { Session } from "@/domain/session/session";
import type { SettingsSectionId } from "@/features/settings/model/settings";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import type { FocusDir, SplitDir } from "@/features/workspace/model/layout";

/** The workspace actions keyboard shortcuts and menu commands run. */
export type WorkspaceActions = {
  onNewFocused(): void;
  onArchiveFocusedSession(event: KeyboardEvent): void;
  onCloseOtherTabs(): void;
  onCloseAllTabs(): void;
  onCloseFocused(): void;
  onNext(): void;
  onPrev(): void;
  onVisitBack(): void;
  onVisitForward(): void;
  onActivate(slot: number): void;
  onSplit(dir: SplitDir): void;
  onFocusDir(dir: FocusDir): void;
  onToggleSidebar(): void;
  onToggleSessionSidebar(): void;
  onToggleFamiliar(): void;
  onGoToFile(): void;
  onOpenCommandPalette(): void;
  onReload(): void;
  onFindInProject(): void;
  onOpenSearch(): void;
  onOpenInbox(): void;
  onOpenNotes(): void;
  pickProject(): Promise<void>;
  onNewTerminal(): void;
  onNewTerminalTab(): void;
  onToggleProjectTerminal(): void;
  onNavigateSessionList(delta: number, inCurrentTab?: boolean): void;
  onNavigateProjectList(delta: number): void;
  openSettings(section?: SettingsSectionId, anchor?: SettingsAnchor): void;
  onOpenApprovalSession(sessionId: string): void;
  onOpenBoardCard(cardId: string): void;
};

/** Which views cover the workspace, as shortcuts need to know. */
export type OpenSurfaces = {
  search: boolean;
  inbox: boolean;
  notes: boolean;
  automations: boolean;
  settings: boolean;
  filePicker: boolean;
  whatsNew: boolean;
  insetLayout: boolean;
};

export type CommandDeps = {
  actions: { readonly current: WorkspaceActions };
  /** Runs a command, dropping a repeat of it within 80 ms (menu and key both fire). */
  run(name: string, fn: () => void): void;
  surfaces(): OpenSurfaces;
  sessions(): Session[];
  isMainWindow(): boolean;
};
