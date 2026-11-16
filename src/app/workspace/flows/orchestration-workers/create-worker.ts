import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { orchestrationProjectCwd } from "@/features/orchestration/model/orchestration";
import type { OrchestrationRun, OrchestrationTask } from "@/features/orchestration/model/orchestration-state";
import { sameProjectPath } from "@/features/projects/model/recents";
import { getSession, upsertSession } from "@/features/sessions/data/session-store";
import { newSession } from "@/features/sessions/model/session";
import { bindHarnessSession } from "@/integrations/harness";
import { mergeModelSettings, resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { commitSessions, findSession, type WorkerDeps } from "./worker-deps";
import { type WorkerWorkspace, workerWorkspace } from "./worker-workspace";

/** The worker's checkout fields: none when it shares the project folder. */
function checkoutFields(projectCwd: string, workspace: WorkerWorkspace) {
  return sameProjectPath(projectCwd, workspace.checkoutCwd)
    ? { worktreeCwd: undefined, branch: undefined }
    : { worktreeCwd: workspace.checkoutCwd, branch: workspace.branch };
}

/** An open worker is re-pointed at its checkout, if its approved setup still holds. */
async function syncOpenWorker(
  deps: WorkerDeps,
  existing: Session,
  lead: Session,
  run: OrchestrationRun,
  task: OrchestrationTask,
  workspace: WorkerWorkspace,
): Promise<void> {
  const projectCwd = orchestrationProjectCwd(run);
  if (
    existing.harness !== task.harness ||
    existing.model !== task.model ||
    !sameProjectPath(existing.cwd, projectCwd) ||
    (!existing.worktreeRemoved && !sameProjectPath(sessionWorkCwd(existing), workspace.checkoutCwd))
  )
    throw new Error(
      "This worker's configuration changed. Restore its approved harness, model and project before retrying.",
    );

  // The lead's runtime mode governs its agents, including across a
  // change mid-run: auto stays auto, supervised asks the lead.
  const synced = {
    ...existing,
    cwd: projectCwd,
    worktreeCwd: checkoutFields(projectCwd, workspace).worktreeCwd,
    branch: workspace.branch,
    worktreeRemoved: false,
    runtimeMode: lead.runtimeMode,
    orchestrationLeadId: run.leadId,
  };
  await upsertSession(synced);
  commitSessions(
    deps,
    deps.sessionsRef.current.map((session) => (session.id === synced.id ? synced : session)),
  );
}

/** A worker restored from storage, or a new one for the task. */
async function restoredOrNewWorker(
  lead: Session,
  run: OrchestrationRun,
  task: OrchestrationTask,
  workspace: WorkerWorkspace,
): Promise<Session> {
  const projectCwd = orchestrationProjectCwd(run);
  const restored = await getSession(task.sessionId);
  if (restored && (restored.harness !== task.harness || restored.model !== task.model))
    throw new Error("The saved worker no longer matches its approved model. Create a new assignment.");

  const checkout = checkoutFields(projectCwd, workspace);
  const base = restored
    ? {
        ...restored,
        busy: false,
        cwd: projectCwd,
        ...checkout,
        worktreeRemoved: false,
        runtimeMode: lead.runtimeMode,
      }
    : {
        ...newSession(task.harness, projectCwd, task.model, lead.runtimeMode),
        ...(checkout.worktreeCwd ? checkout : {}),
        ...(task.modelSettings
          ? { modelSettings: mergeModelSettings(resolveModel(task.harness, task.model), task.modelSettings) }
          : {}),
        id: task.sessionId,
        title: task.title,
      };
  return { ...base, orchestrationLeadId: run.leadId };
}

/** Prepares a worker session in its checkout and attaches it to the lead's control. */
export async function createWorker(deps: WorkerDeps, run: OrchestrationRun, task: OrchestrationTask) {
  const lead = findSession(deps, run.leadId);
  if (!lead) throw new Error("Lead session is unavailable");
  const workspace = await workerWorkspace(run, task);
  const scratchDir = await invoke<string>("control_attach_worker", {
    leadId: run.leadId,
    sessionId: task.sessionId,
  });

  const existing = findSession(deps, task.sessionId);
  if (existing) {
    await syncOpenWorker(deps, existing, lead, run, task, workspace);
    return { scratchDir, workspace };
  }

  const worker = await restoredOrNewWorker(lead, run, task, workspace);
  if (worker.providerSessionId)
    bindHarnessSession(
      worker.harness,
      worker.id,
      worker.providerSessionId,
      sessionWorkCwd(worker),
      worker.providerAccountId,
      worker.blocks,
    );
  await upsertSession(worker);
  commitSessions(deps, [...deps.sessionsRef.current, worker]);
  // Workers belong to the lead's agent panel; no workspace tab is created.
  return { scratchDir, workspace };
}
