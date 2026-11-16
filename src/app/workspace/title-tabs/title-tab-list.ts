import type { Session } from "@/domain/session/session";
import {
  familiarLook,
  familiarState,
  familiarWorksOn,
  findFamiliar,
} from "@/features/familiars/model/familiar";
import {
  APP_VIEW_LABELS,
  type AppView,
  appViewTabId,
  familiarTabId,
} from "@/features/workspace/model/app-view-tabs";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import { orderByIds } from "@/shared/lib/reorder";
import { isBlankWorkspaceTab } from "../../model/blank-workspace-tab";
import { toTitleTab } from "./to-title-tab";

export type TitleTabListInput = {
  projectTabs: WorkspaceTab[];
  sessions: Session[];
  dirtyFiles: Set<string>;
  unseenFinishedIds: ReadonlySet<string>;
  insetLayout: boolean;
  openAppViews: AppView[];
  notesEnabled: boolean;
  familiarTabs: string[];
  sidebarCwd: string;
  order: string[];
  /** The view tab shown over the workspace, if any. */
  shownViewTabId?: string;
};

function appViewTab(view: AppView): TitleTab {
  return {
    id: appViewTabId(view),
    appView: view,
    project: "",
    title: APP_VIEW_LABELS[view],
    more: [],
    sessionCount: 0,
    harnesses: [],
    busyHarnesses: [],
    files: [],
  };
}

/**
 * Like the sidebar's Familiars, a Familiar's tab shows in the projects it
 * works on; it keeps its place for when the project comes back.
 */
function familiarTab(familiarId: string, sessions: Session[], sidebarCwd: string): TitleTab[] {
  const familiar = findFamiliar(familiarId);
  if (!familiar || !familiarWorksOn(familiar, sidebarCwd)) return [];
  const look = familiarLook(familiar);
  const session = familiar.sessionId ? sessions.find((entry) => entry.id === familiar.sessionId) : undefined;
  return [
    {
      id: familiarTabId(familiarId),
      familiar: {
        mascot: look.mascot,
        color: look.color,
        status: session ? familiarState(session).status : "idle",
      },
      project: "",
      title: look.name,
      more: [],
      sessionCount: 0,
      harnesses: [],
      busyHarnesses: [],
      files: [],
    },
  ];
}

/**
 * The title bar's tabs: the project's workspace tabs, then (inset layout)
 * app views and Familiars, in the user's order. Like a browser, a view tab can
 * be the only tab: the project's lone blank tab stays underneath, out of the
 * strip, until closing the last view shows it again.
 */
export function titleTabList(input: TitleTabListInput): TitleTab[] {
  const { projectTabs, sessions, insetLayout } = input;
  const ordered = orderByIds(
    [
      ...projectTabs.map((tab) => toTitleTab(tab, sessions, input.dirtyFiles, input.unseenFinishedIds)),
      ...(insetLayout
        ? input.openAppViews.filter((view) => view !== "notes" || input.notesEnabled).map(appViewTab)
        : []),
      ...input.familiarTabs.flatMap((familiarId) => familiarTab(familiarId, sessions, input.sidebarCwd)),
    ],
    insetLayout ? input.order : [],
  );

  const { shownViewTabId } = input;
  const placeholderTab =
    insetLayout &&
    shownViewTabId &&
    ordered.some((tab) => tab.id === shownViewTabId) &&
    projectTabs.length === 1 &&
    isBlankWorkspaceTab(projectTabs[0], sessions)
      ? projectTabs[0].id
      : undefined;
  return placeholderTab ? ordered.filter((tab) => tab.id !== placeholderTab) : ordered;
}
