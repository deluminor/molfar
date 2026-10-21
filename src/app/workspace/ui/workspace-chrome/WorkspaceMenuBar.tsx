import type { ComponentProps } from "react";
import { MenuBar } from "../../../shell/MenuBar";
import { zoomUi } from "../../hooks/commands/ui-zoom";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Omit<
  ComponentProps<typeof MenuBar>,
  "onCloseCurrentTab" | "onZoomIn" | "onZoomOut" | "onZoomReset"
> & {
  store: WorkspaceStore;
  onCloseTab: (tabId: string) => void;
};

const zoomIn = () => zoomUi("zoom-in");
const zoomOut = () => zoomUi("zoom-out");
const zoomReset = () => zoomUi("zoom-reset");

/** The in-window menu bar, for platforms without a native one. */
export function WorkspaceMenuBar({ store, onCloseTab, ...menuProps }: Props) {
  const activeTabId = useWorkspaceField(store, "activeTabId");

  return (
    <MenuBar
      {...menuProps}
      onCloseCurrentTab={activeTabId ? () => onCloseTab(activeTabId) : undefined}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onZoomReset={zoomReset}
    />
  );
}
