import type { Session } from "@/domain/session/session";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import type {
  FilePaneTab,
  WorkspaceTab,
} from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../../store/types";

/** The title bar's tabs as rendered, and how to select one. */
export type DisplayedTabNavigation = {
  tabs: readonly TitleTab[];
  activeId: string;
  select?: (id: string) => void;
};

export type TabCloseDeps = {
  store: WorkspaceStore;
  tabs(): WorkspaceTab[];
  sessions(): Session[];
  activeTabId(): string;
  projectCwd(): string;
  dirtyFiles(): ReadonlySet<string>;
  /** Publishes sessions through Workspace's ref and the store. */
  setSessions(update: (sessions: Session[]) => Session[]): void;
  setComposerFocused(focused: boolean): void;
  insetLayout(): boolean;
  navigation(): DisplayedTabNavigation;
  /** The worktree a tab works in, pinned or from its sessions. */
  tabWorkspace(tab: WorkspaceTab, sessions: readonly Session[]): string | null;
  activateTab(tabId: string): void;
  persist(session: Session | undefined): void;
  /** Lists the sidebar project's saved sessions again. */
  refreshHistory(): void;
  closeFamiliarView(): void;
  confirmDiscardUnsaved(message: string): Promise<boolean>;
  confirmCloseTerminal(file: FilePaneTab): Promise<boolean>;
  confirmCloseTerminals(files: FilePaneTab[]): Promise<boolean>;
};
