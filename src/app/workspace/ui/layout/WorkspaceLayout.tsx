import type { ReactNode, RefObject } from "react";
import { HAS_NATIVE_GLASS, IS_MAC } from "@/shared/lib/platform";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { WorkspaceMenuBar } from "../workspace-chrome/WorkspaceMenuBar";
import type { WorkspaceChrome } from "./workspace-chrome";

type Props = {
  store: WorkspaceStore;
  insetLayout: boolean;
  notesEnabled: boolean;
  chrome: WorkspaceChrome;
  titleBar: ReactNode;
  sidebar: ReactNode;
  onInsetRailHost: (host: HTMLDivElement | null) => void;
  dockGridRef: RefObject<HTMLDivElement | null>;
  /** The project terminal docks, in the grid beside the panes. */
  docks: ReactNode;
  panes: ReactNode;
  linkedPanels: ReactNode;
  familiarOverview: ReactNode;
  familiarSettings: ReactNode;
  appViews: ReactNode;
  settings: ReactNode;
  usageFooter: ReactNode;
  /** The inset layout's right panel, beside the card. */
  rightPanel: ReactNode;
  /** Pickers, notices and dialogs over the whole window, in stacking order. */
  overlays: ReactNode;
};

/** The window's frame: title bar, sidebar, workspace body, views and footer, in the classic or inset layout. */
export function WorkspaceLayout({
  store,
  insetLayout,
  notesEnabled,
  chrome,
  titleBar,
  sidebar,
  onInsetRailHost,
  dockGridRef,
  docks,
  panes,
  linkedPanels,
  familiarOverview,
  familiarSettings,
  appViews,
  settings,
  usageFooter,
  rightPanel,
  overlays,
}: Props) {
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  let background = "bg-background-base";
  if (insetLayout) background = "inset-shell inset-outer";
  else if (HAS_NATIVE_GLASS) background = "bg-background-base/[var(--window-background-opacity)]";

  return (
    <div className={`workspace-background flex h-full flex-col text-content ${background}`}>
      {chrome.titleBarSpansWindow ? titleBar : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        {insetLayout ? (
          <div ref={onInsetRailHost} className="inset-rail-host flex h-full shrink-0">
            {sidebar}
          </div>
        ) : null}
        {/* `contents` keeps the classic layout's flat row; the inset
            layout stacks the tabs, the card and the footer. */}
        <div className={insetLayout ? "flex min-h-0 min-w-0 flex-1 flex-col" : "contents"}>
          <div
            className={
              insetLayout
                ? "inset-card mr-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] border border-stroke"
                : "contents"
            }
          >
            {insetLayout ? null : sidebar}

            <div className={`flex min-h-0 min-w-0 flex-1 flex-col${insetLayout ? "" : " body-glass"}`}>
              <div
                className={chrome.surfaceOpen ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}
                aria-hidden={chrome.surfaceOpen}
                inert={chrome.surfaceOpen || undefined}
              >
                {!IS_MAC ? <WorkspaceMenuBar store={store} notesEnabled={notesEnabled} /> : null}
                <div className="flex min-h-0 min-w-0 flex-1">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {chrome.titleBarInBody ? titleBar : null}

                    <main className="relative flex min-h-0 min-w-0 flex-1">
                      <div ref={dockGridRef} className="grid h-full min-h-0 min-w-0 flex-1">
                        {docks}
                        <div
                          className="relative flex min-h-0 min-w-0 flex-row"
                          style={{ gridArea: "main" }}
                        >
                          <div className="relative min-h-0 min-w-0 flex-1">{panes}</div>
                        </div>
                      </div>
                      {linkedPanels}
                    </main>
                  </div>
                  {familiarOverview}
                  {familiarSettings}
                </div>
              </div>
              {appViews}
              {settings}
              {insetLayout ? null : usageFooter}
            </div>
            {insetLayout ? rightPanel : null}
          </div>
          {insetLayout
            ? (usageFooter ??
              // Settings has no footer, so the card runs down to the same
              // gutter as its right edge.
              <div className={`${settingsOpen ? "h-1.5" : "h-[30px]"} shrink-0`} />)
            : null}
        </div>
      </div>

      {overlays}
    </div>
  );
}
