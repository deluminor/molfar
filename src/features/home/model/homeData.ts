import { listAutomations } from "../../automations/model/automations";
import { buildHomeStatus, type HomeStatus } from "./homeStatus";
import {
  pickRecentAutomations,
  type RecentAutomationRow,
} from "./recentAutomations";
import {
  RECENT_SESSIONS_LIMIT,
  pickRecentSessions,
  scanProjectSessions,
  type RecentSessionRow,
} from "./recentSessions";

export type HomeDashboardData = {
  status: HomeStatus;
  sessions: RecentSessionRow[];
  automations: RecentAutomationRow[];
};

const HOME_AUTOMATIONS_LIMIT = 3;

/**
 * One parallel fetch for Status / Sessions / Automations cards.
 * Keeps Home UI off automations/session store internals.
 */
export async function loadHomeDashboard(
  projectPaths: readonly string[],
  sessionLimit = RECENT_SESSIONS_LIMIT,
  automationLimit = HOME_AUTOMATIONS_LIMIT,
): Promise<HomeDashboardData> {
  const [sessionRows, automationRows] = await Promise.all([
    scanProjectSessions(projectPaths),
    listAutomations(),
  ]);
  return {
    status: buildHomeStatus(sessionRows, automationRows),
    sessions: pickRecentSessions(sessionRows, sessionLimit),
    automations: pickRecentAutomations(automationRows, automationLimit),
  };
}
