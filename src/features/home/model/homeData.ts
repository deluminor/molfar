import { listAutomations } from "../../automations/model/automations";
import { buildHomeStatus, type HomeStatus } from "./homeStatus";
import {
  pickRecentAutomations,
  type RecentAutomationRow,
} from "./recentAutomations";
import {
  pickRecentSessions,
  scanProjectSessions,
  type RecentSessionRow,
} from "./recentSessions";

export type HomeDashboardData = {
  status: HomeStatus;
  sessions: RecentSessionRow[];
  automations: RecentAutomationRow[];
};

/**
 * One parallel fetch for Status / Sessions / Automations cards.
 * Keeps Home UI off automations/session store internals.
 */
export async function loadHomeDashboard(
  projectPaths: readonly string[],
  limit = 3,
): Promise<HomeDashboardData> {
  const [sessionRows, automationRows] = await Promise.all([
    scanProjectSessions(projectPaths),
    listAutomations(),
  ]);
  return {
    status: buildHomeStatus(sessionRows, automationRows),
    sessions: pickRecentSessions(sessionRows, limit),
    automations: pickRecentAutomations(automationRows, limit),
  };
}
