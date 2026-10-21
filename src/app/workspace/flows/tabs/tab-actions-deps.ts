import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { OpenDiffDeps } from "../files/open-diff";
import type { PaneDeps } from "./pane-deps";
import type { TabLayoutDeps } from "./tab-layout";
import type { TabVisits } from "./tab-visits";

export type TabActionsDeps = {
  pane: PaneDeps;
  diff: OpenDiffDeps;
  layout: TabLayoutDeps;
  visits: TabVisits;
  /** The tabs the deck shows for the current project, as last rendered. */
  deckTabs(): readonly WorkspaceTab[];
};
