import type { Session } from "@/domain/session/session";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";

export function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function openSessionIds(tabs: WorkspaceTab[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    for (const id of leafIds(tab.layout)) ids.add(id);
  }
  return ids;
}

/** Ids of the matching sessions, with the orchestration lead of each, so a lead shows its workers' state. */
export function sessionIdsWithLeads(
  sessions: readonly Session[],
  matches: (session: Session) => boolean,
): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (!matches(session)) continue;
    ids.add(session.id);
    if (session.orchestrationLeadId) ids.add(session.orchestrationLeadId);
  }
  return ids;
}

export function isBusySession(session: Session): boolean {
  return session.busy === true;
}
