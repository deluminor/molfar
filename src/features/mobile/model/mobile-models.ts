import { listWorktrees } from "@/features/source-control/model/worktrees";
import { listFamiliars } from "@/features/familiars/model/familiar";
import { pathKey, projectName } from "@/shared/lib/paths";
import {
  HARNESSES,
  HARNESS_TITLE,
  type HarnessId,
} from "@/domain/harness/harness";
import {
  RUNTIME_MODES,
  RUNTIME_MODE_HINT,
  RUNTIME_MODE_LABEL,
  type RuntimeMode,
} from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import { isPickerProviderVisible } from "@/features/sessions/model/models";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import { isHarnessAvailable } from "@/integrations/harness/core/availability";
import {
  mobileAccountChoice,
  mobileProviderAccounts,
  mobileSessionAccountId,
} from "./mobile-provider-accounts";
import {
  mobileNewSession,
  mobileProjectId,
  mobileProjectPaths,
} from "./mobile-catalog";
import { readSaved } from "./mobile-conversation";

/**
 * What the phone's model sheet offers: each provider the desktop's model
 * picker shows, its models with their settings (effort, fast mode and the
 * rest come as each model's own settings), the permission modes, and what a
 * conversation, or a new session in a project, would run with now.
 */
export async function mobileModels(
  params: { projectId?: string; conversationId?: string },
  live: readonly Session[],
  saved?: Map<string, Session>,
  runtimeMode?: RuntimeMode,
) {
  const harnesses = HARNESSES.filter(
    (id) => isHarnessAvailable(id) && isPickerProviderVisible(id),
  );
  let current: Session | undefined;
  const conversationId = params.conversationId;
  if (conversationId) {
    const familiar = conversationId.startsWith("familiar:")
      ? listFamiliars().find(
          (familiar) =>
            familiar.id === conversationId.slice("familiar:".length),
        )
      : undefined;
    const sessionId = familiar ? familiar.sessionId : conversationId;
    current = sessionId
      ? (live.find((session) => session.id === sessionId) ??
        (await readSaved(sessionId, saved)) ??
        undefined)
      : undefined;
  }
  if (!current) {
    const path = mobileProjectPaths().find(
      (path) => mobileProjectId(path) === params.projectId,
    );
    if (!path) throw new Error("Project is no longer available");
    current = mobileNewSession(path, runtimeMode);
  }
  const model = resolveModel(current.harness, current.model);
  return {
    harnesses: harnesses.map((id) => ({ id, label: HARNESS_TITLE[id] })),
    models: harnesses.flatMap((harness) =>
      modelsFor(harness).map((entry) => ({
        id: entry.id,
        harness: entry.harness,
        name: entry.name,
        provider: entry.provider?.name,
        settings: entry.settings ?? [],
      })),
    ),
    runtimeModes: RUNTIME_MODES.map((id) => ({
      id,
      label: RUNTIME_MODE_LABEL[id],
      hint: RUNTIME_MODE_HINT[id],
    })),
    ...mobileProviderAccounts(current.cwd),
    current: {
      harness: current.harness,
      model: model.id,
      modelSettings: mergeModelSettings(model, current.modelSettings),
      runtimeMode: current.runtimeMode,
      providerAccountId: mobileSessionAccountId(current),
    },
  };
}

/** A model sheet choice from the phone, keeping only what is well formed. */
export function mobileChoice(params: Record<string, unknown>): {
  harness?: HarnessId;
  model?: string;
  modelSettings?: Record<string, string>;
  runtimeMode?: RuntimeMode;
} {
  const harness = HARNESSES.find((id) => id === params.harness);
  const model =
    typeof params.model === "string" && params.model.length <= 256
      ? params.model
      : undefined;
  const raw = params.modelSettings;
  const modelSettings =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? Object.fromEntries(
          Object.entries(raw).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && entry[1].length <= 64,
          ),
        )
      : undefined;
  const runtimeMode = RUNTIME_MODES.find((mode) => mode === params.runtimeMode);
  return {
    ...(harness && model ? { harness, model } : {}),
    ...(modelSettings ? { modelSettings } : {}),
    ...(runtimeMode ? { runtimeMode } : {}),
  };
}

/** A new session from the phone, set to the model sheet's choice if it made one. */
export function applyMobileChoice(
  session: Session,
  params: Record<string, unknown>,
): Session {
  const choice = mobileChoice(params);
  const model = choice.harness
    ? resolveModel(choice.harness, choice.model)
    : resolveModel(session.harness, session.model);
  return {
    ...session,
    harness: model.harness,
    model: model.id,
    providerAccountId: mobileAccountChoice(model.harness, session.cwd, params),
    modelSettings: mergeModelSettings(
      model,
      choice.modelSettings ?? session.modelSettings,
    ),
    runtimeMode: choice.runtimeMode ?? session.runtimeMode,
  };
}

/** The other working copies a phone can start a session in, as the desktop
 *  composer's workspace picker lists them. */
export async function mobileProjectWorktrees(projectId: string) {
  const cwd = mobileProjectPaths().find(
    (path) => mobileProjectId(path) === projectId,
  );
  if (!cwd) throw new Error("Project is no longer available");
  const { worktrees } = await listWorktrees(cwd);
  return {
    worktrees: worktrees
      .filter((tree) => !tree.isMain && !tree.missing)
      .map((tree) => ({
        path: tree.path,
        name: tree.branch ?? projectName(tree.path),
      })),
  };
}

/**
 * Where a phone's new session works: a new worktree off HEAD, made on the
 * first send as automations do, or one of the project's existing worktrees,
 * checked against its list rather than trusted. Else the project's checkout.
 */
export async function mobileWorkspaceChoice(
  cwd: string,
  params: Record<string, unknown>,
): Promise<Partial<Session>> {
  if (params.workspaceMode === "worktree")
    return { workspaceMode: "worktree", worktreeBase: "HEAD" };
  if (typeof params.worktreePath !== "string") return {};
  const tree = await mobileWorktree(cwd, params.worktreePath);
  return { worktreeCwd: tree.path, branch: tree.branch ?? undefined };
}

/** One of the project's other worktrees, by a path the phone named. */
export async function mobileWorktree(cwd: string, path: string) {
  const wanted = pathKey(path);
  const tree = (await listWorktrees(cwd)).worktrees.find(
    (tree) => !tree.isMain && !tree.missing && pathKey(tree.path) === wanted,
  );
  if (!tree) throw new Error("That worktree is no longer available");
  return tree;
}
