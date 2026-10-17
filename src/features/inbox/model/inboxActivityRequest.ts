import type { InboxQuery } from "./githubTasks";
import {
  loadInboxFiltersBySource,
  pruneInboxFilters,
  widestInboxFetchParams,
  type InboxFiltersBySource,
  type InboxSource,
} from "./inboxFilters";
import { loadHiddenLinearTeamIds } from "./linear";
import { loadHiddenJiraProjectIds } from "./jira";

/** Saved filters and the widest query the background poll fetches with. */
export function inboxActivityRequest(projectPaths: readonly string[]): {
  pruned: InboxFiltersBySource;
  query: InboxQuery;
} {
  const bySource = loadInboxFiltersBySource();
  const pruned = { ...bySource } as InboxFiltersBySource;
  for (const source of Object.keys(bySource) as InboxSource[]) {
    pruned[source] = pruneInboxFilters(bySource[source], projectPaths);
  }
  const widest = widestInboxFetchParams(pruned);
  return {
    pruned,
    query: {
      assignedToMe: widest.assignedToMe,
      state: widest.state,
      search: "",
      linearHiddenTeamIds: loadHiddenLinearTeamIds(),
      jiraHiddenProjectIds: loadHiddenJiraProjectIds(),
    },
  };
}
