export type MobileSelection = { projectIds: string[]; familiarIds: string[] };

/**
 * Whether familiars can be picked and shown. Off for the first version, as the
 * phone has no good way to talk to them yet; familiars picked before are kept in
 * the selection, so they come back when this is turned on.
 */
export const FAMILIARS_ENABLED = false;
export function normalizeSelection(value: unknown): MobileSelection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!Array.isArray(item.projectIds) || !Array.isArray(item.familiarIds))
    return null;
  const ids = (values: unknown[]) => [
    ...new Set(
      values.filter((value): value is string => typeof value === "string"),
    ),
  ];
  return { projectIds: ids(item.projectIds), familiarIds: ids(item.familiarIds) };
}
export function selectedWorkspace<
  T extends {
    projects: { id: string }[];
    familiars: { id: string }[];
    sessions: { projectId: string; familiarId?: string }[];
  },
>(catalog: T, selection: MobileSelection | null) {
  const projects = new Set(selection?.projectIds ?? []);
  const familiars = new Set(FAMILIARS_ENABLED ? (selection?.familiarIds ?? []) : []);
  return {
    ...catalog,
    projects: catalog.projects.filter((project) => projects.has(project.id)),
    familiars: catalog.familiars.filter((familiar) => familiars.has(familiar.id)),
    sessions: catalog.sessions.filter(
      (session) =>
        projects.has(session.projectId) ||
        (!!session.familiarId && familiars.has(session.familiarId)),
    ),
  };
}
