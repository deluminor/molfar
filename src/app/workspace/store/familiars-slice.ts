import type { FamiliarActivitySelection } from "@/features/familiars/model/familiar-activity";
import type { MonoChangesRequest } from "@/features/familiars/ui/FamiliarChangesView";
import type { FamiliarOverviewTab } from "@/features/familiars/ui/FamiliarOverview";
import type { StateUpdate } from "./state-update";

/** The Familiar shown over the workspace and its overview beside the chat. */
export type FamiliarsState = {
  /** Session of the Familiar in full view; null shows the workspace. */
  familiarViewId: string | null;
  /** A Familiar opens with its overview beside the chat until it is hidden. */
  familiarOverviewOpen: boolean;
  familiarOverviewTab: FamiliarOverviewTab;
  /** The Familiar whose settings dialog is open. */
  familiarSettingsFor: string | null;
  /** What the overview's Changes tab was last asked to show. */
  familiarChangesRequest: MonoChangesRequest;
  familiarActivity: FamiliarActivitySelection | null;
  /** A launched session open over the overview's list. */
  familiarShownSession: string | null;
  /** A document open over the overview's list. */
  familiarOverviewDocument: string | null;
  /** Whether the shown session, rather than the Familiar's chat, holds focus. */
  familiarShownSessionFocused: boolean;
};

export type FamiliarsActions = {
  setFamiliarViewId: (update: StateUpdate<string | null>) => void;
  setFamiliarOverviewOpen: (update: StateUpdate<boolean>) => void;
  setFamiliarOverviewTab: (update: StateUpdate<FamiliarOverviewTab>) => void;
  setFamiliarSettingsFor: (update: StateUpdate<string | null>) => void;
  setFamiliarChangesRequest: (update: StateUpdate<MonoChangesRequest>) => void;
  setFamiliarActivity: (
    update: StateUpdate<FamiliarActivitySelection | null>,
  ) => void;
  setFamiliarShownSession: (update: StateUpdate<string | null>) => void;
  setFamiliarOverviewDocument: (update: StateUpdate<string | null>) => void;
  setFamiliarShownSessionFocused: (update: StateUpdate<boolean>) => void;
};

export const INITIAL_FAMILIARS_STATE: FamiliarsState = {
  familiarViewId: null,
  familiarOverviewOpen: true,
  familiarOverviewTab: "sessions",
  familiarSettingsFor: null,
  familiarChangesRequest: {},
  familiarActivity: null,
  familiarShownSession: null,
  familiarOverviewDocument: null,
  familiarShownSessionFocused: false,
};

/** The launched session shown beside the open Familiar's chat, if any. */
export function shownFamiliarSession(state: FamiliarsState): string | undefined {
  return state.familiarViewId &&
    state.familiarOverviewOpen &&
    state.familiarShownSession
    ? state.familiarShownSession
    : undefined;
}
