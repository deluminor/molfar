import { dropContextWindow } from "@/domain/session/context-usage";
import {
  defaultSessionChoice,
  firstEnabledHarness,
  preferredModelId,
  preferredModelSettings,
} from "./models";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { loadProjectProviderSettings } from "./project-providers";
import { HARNESS_LABEL, type HarnessId } from "@/domain/harness/harness";
import { DEFAULT_RUNTIME_MODE, type RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";

export function newSession(
  harness: HarnessId = "claude",
  cwd = "~",
  model?: string,
  runtimeMode: RuntimeMode = DEFAULT_RUNTIME_MODE,
  modelSettings?: Record<string, string>,
): Session {
  const resolved = resolveModel(harness, model ?? preferredModelId(harness));
  return {
    id: crypto.randomUUID(),
    harness,
    model: resolved.id,
    modelSettings: preferredModelSettings(resolved, modelSettings),
    runtimeMode,
    title: HARNESS_LABEL[harness],
    cwd,
    blocks: [],
  };
}

/** New conversation using the Providers defaults. */
export function newDefaultSession(
  cwd = "~",
  runtimeMode: RuntimeMode = DEFAULT_RUNTIME_MODE,
): Session {
  const choice = defaultSessionChoice(cwd);
  return newSession(choice.harness, cwd, choice.model, runtimeMode);
}

/**
 * Provider and model a seeded session should use in `cwd`. The project's own
 * default provider and model win over the seed; when the project has neither,
 * the seed's provider and model are carried. A provider the project hides is
 * swapped for its first enabled one.
 */
function projectSessionChoice(
  seed: Pick<Session, "harness" | "model"> | undefined,
  cwd: string,
): { harness: HarnessId; model?: string } {
  const project = loadProjectProviderSettings(cwd);
  const seedHarness = seed?.harness ?? "claude";
  const harness = firstEnabledHarness(
    cwd,
    project.defaultHarness ?? seedHarness,
  );
  const model =
    project.models?.[harness] ??
    (project.defaultHarness === harness ? project.defaultModel : undefined) ??
    (project.defaultHarness == null && harness === seedHarness
      ? seed?.model
      : undefined);
  return { harness, model };
}

/**
 * New conversation for a project. The project's default provider and model win
 * over the seed's; a provider the project has hidden is swapped for its first
 * enabled one.
 */
export function newSessionForProject(
  seed: Session | undefined,
  cwd: string,
): Session {
  const { harness, model } = projectSessionChoice(seed, cwd);
  const carriesSeed =
    model != null && model === seed?.model && harness === seed?.harness;
  return newSession(
    harness,
    cwd,
    model,
    seed?.runtimeMode,
    carriesSeed ? seed?.modelSettings : undefined,
  );
}

/**
 * Retarget an existing session (typically a blank one) to a project, adopting
 * that project's provider defaults while keeping its id, blocks and composer
 * seed.
 */
export function retargetSessionToProject(
  session: Session,
  cwd: string,
): Session {
  const { harness, model } = projectSessionChoice(session, cwd);
  const resolved = resolveModel(harness, model ?? preferredModelId(harness));
  const carriesSeed =
    model != null && model === session.model && harness === session.harness;
  return {
    ...session,
    cwd,
    harness,
    model: resolved.id,
    modelSettings: preferredModelSettings(
      resolved,
      carriesSeed ? session.modelSettings : undefined,
    ),
    title: HARNESS_LABEL[harness],
    ...(harness === session.harness
      ? {}
      : { providerSessionId: undefined, providerAccountId: undefined }),
    ...(resolved.id === session.model
      ? {}
      : { context: dropContextWindow(session.context) }),
  };
}

/** New conversation carrying another session's harness, model and settings. */
export function newSessionLike(
  seed: Session | undefined,
  cwd: string,
): Session {
  return newSession(
    seed?.harness ?? "claude",
    cwd,
    seed?.model,
    seed?.runtimeMode,
    seed?.modelSettings,
  );
}

