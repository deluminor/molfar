import {
  loadRecents,
  loadPinnedProjects,
  sameProjectPath,
} from "@/features/projects/model/recents";
import {
  listFamiliars,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { projectName } from "@/shared/lib/paths";
import {
  getSession,
  listSessionsByProject,
  type SessionSummary,
} from "@/features/sessions/data/session-store";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import { hasPendingApproval } from "@/domain/session/session-state";
import { newDefaultSession } from "@/features/sessions/model/session";
import { sessionDisplayTitle } from "@/domain/session/title";
import type { Session } from "@/domain/session/session";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import {
  resolveTabGroupColor,
  resolveTabGroupMascot,
  loadTabGroupColors,
  loadTabGroupMascots,
} from "@/features/workspace/model/tab-groups";
import { mobileMessages } from "./mobile-conversation";

export const mobileProjectId = (path: string) => encodeURIComponent(path);

/**
 * A session the phone starts in `cwd`, as a new desktop tab would start it:
 * the project's or the last chosen provider and model, and the permission mode
 * of the desktop's active session.
 */
export function mobileNewSession(
  cwd: string,
  runtimeMode?: RuntimeMode,
): Session {
  return newDefaultSession(cwd, runtimeMode);
}

export async function mobileCatalog(
  live: readonly Session[],
  runtimeMode?: RuntimeMode,
) {
  const roster = listFamiliars();
  const paths = [
    ...new Set([
      ...loadRecents().map((project) => project.path),
      ...loadPinnedProjects(),
      ...roster.flatMap((familiar) => familiar.projects),
    ]),
  ].filter((path) => path && path !== "~");
  const colors = loadTabGroupColors();
  const mascots = loadTabGroupMascots();
  const projects = paths.map((path) => {
    const defaults = mobileNewSession(path, runtimeMode);
    return {
      id: mobileProjectId(path),
      path,
      name: projectName(path),
      machine: "Desktop",
      branch: "",
      color: resolveTabGroupColor(path, colors),
      mascot: resolveTabGroupMascot(path, mascots),
      additions: 0,
      deletions: 0,
      defaultHarness: defaults.harness,
      defaultModel: defaults.model,
      defaultModelName: resolveModel(defaults.harness, defaults.model).name,
      defaultRuntimeMode: defaults.runtimeMode,
    };
  });
  const summaries = (
    await Promise.all(
      paths.map((path) => listSessionsByProject(path).catch(() => [])),
    )
  ).flat();
  const sessions = new Map<string, ReturnType<typeof mobileSummary>>();
  for (const summary of summaries) {
    if (
      !summary.archived &&
      !summary.sidebarHidden &&
      !summary.orchestrationLeadId
    )
      sessions.set(summary.id, mobileSummary(summary));
  }
  for (const session of live) {
    if (
      session.inboxAsk ||
      session.orchestrationLeadId ||
      session.sidebarHidden ||
      roster.some((familiar) => familiar.sessionId === session.id)
    )
      continue;
    if (paths.some((path) => sameProjectPath(path, session.cwd)))
      sessions.set(session.id, {
        id: session.id,
        projectId: mobileProjectId(session.cwd),
        title: sessionDisplayTitle(session.title, session.harness),
        harness: session.harness,
        model: session.model,
        modelName: resolveModel(session.harness, session.model).name,
        branch: session.worktreeRemoved ? "" : (session.branch ?? ""),
        ...mobileSessionWorktree(session),
        runtimeMode: session.runtimeMode,
        updatedAt:
          [...session.blocks].reverse().find((block) => block.startedAt)
            ?.startedAt ?? 0,
        busy: !!session.busy,
        // What it waits on the user for, so the phone can notify of it.
        ...(hasPendingApproval(session.blocks)
          ? { waiting: "approval" as const }
          : session.pendingQuestion
            ? { waiting: "question" as const }
            : {}),
        live: true,
      });
  }
  const familiars = await Promise.all(
    roster.map(async (familiar) => {
      const session =
        live.find((session) => session.id === familiar.sessionId) ??
        (familiar.sessionId
          ? await getSession(familiar.sessionId).catch(() => undefined)
          : undefined);
      const messages = session ? mobileMessages(session) : [];
      const last = messages[messages.length - 1];
      const lastActiveAt = session
        ? ([...session.blocks].reverse().find((block) => block.startedAt)
            ?.startedAt ?? 0)
        : 0;
      return {
        id: familiar.id,
        name: familiarLook(familiar).name,
        mascot: familiar.mascot,
        color: familiar.color,
        projectIds: familiar.projects.map(mobileProjectId),
        unread: 0,
        status: session ? familiarState(session).status : "idle",
        busy: !!session?.busy,
        live: live.some((current) => current.id === familiar.sessionId),
        sessionId: familiar.sessionId,
        harness: session?.harness,
        model: session?.model,
        lastMessage: last?.text ?? "",
        lastActiveAt,
      };
    }),
  );
  return {
    projects,
    familiars,
    sessions: [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt),
  };
}
/** The worktree a session works in, so the phone shows its changes and files
 *  rather than the checkout's; none once the worktree is gone. */
function mobileSessionWorktree(session: {
  worktreeCwd?: string;
  worktreeRemoved?: boolean;
}) {
  return session.worktreeCwd && !session.worktreeRemoved
    ? { worktreePath: session.worktreeCwd }
    : {};
}
function mobileSummary(session: SessionSummary) {
  return {
    id: session.id,
    projectId: mobileProjectId(session.cwd),
    title: sessionDisplayTitle(session.title, session.harness),
    harness: session.harness,
    model: session.model,
    modelName: resolveModel(session.harness, session.model).name,
    branch: session.branch ?? "",
    ...mobileSessionWorktree(session),
    runtimeMode: session.runtimeMode,
    updatedAt: session.updatedAt,
    busy: false,
    live: false,
  };
}
export function mobileProjectPaths() {
  return [
    ...loadRecents().map((project) => project.path),
    ...loadPinnedProjects(),
    ...listFamiliars().flatMap((familiar) => familiar.projects),
  ];
}
