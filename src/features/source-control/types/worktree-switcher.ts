import type { ReactNode, RefObject } from "react";

/** How a flyout off the project menu places itself and joins the menu. */
export type ProjectMenuFlyout = {
  anchor: RefObject<HTMLButtonElement | null>;
  layer: number;
  attributes: Record<`data-${string}`, boolean>;
  onClose: () => void;
};

/** Names the project in the title; the project and worktree pickers move to
 * submenus. */
export type WorktreeSwitcherProject = {
  name: string;
  icon: ReactNode;
  onOpenSettings?: () => void;
  settingsShortcut?: string;
  /** Renders the project picker as a flyout beside its row. */
  renderProjectPicker?: (flyout: ProjectMenuFlyout) => ReactNode;
  /** A dialog or menu opened from a flyout keeps the menu up behind it. */
  keepOpen?: boolean;
  /** Opens the project's own menu (name, look, pinning, removal) as a flyout
   * beside the given row, the same one right-clicking a project shows. */
  onOpenProjectSettings?: (row: HTMLElement) => void;
  /** Opens the project's settings directly from its title. */
  onContextMenu?: (x: number, y: number, trigger: HTMLElement) => void;
  onCloseProjectSettings?: () => void;
  projectSettingsOpen?: boolean;
};
