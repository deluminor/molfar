import type { WorkspaceViewFlowsInput } from "./types";
import { useChromeViewFlows } from "./use-chrome-view-flows";
import { useNavigationViewFlows } from "./use-navigation-view-flows";

/** The title tab flows and what the view shows from them, in render order: navigation, then chrome. */
export function useWorkspaceViewFlows(input: WorkspaceViewFlowsInput) {
  const navigation = useNavigationViewFlows(input);
  const chrome = useChromeViewFlows(input, navigation);
  const { titleTabFlows, titleTabs, histories, inboxActivity, inboxView, localSurfaceActions } = navigation;

  return { titleTabFlows, view: { titleTabs, histories, inboxActivity, inboxView, localSurfaceActions, ...chrome } };
}
