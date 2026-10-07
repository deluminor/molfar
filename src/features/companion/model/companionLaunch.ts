import { isHarnessAvailable } from "../../../integrations/harness/core/availability";
import type { QuickLaunch } from "../../quick-composer/model/quickComposer";
import {
  defaultSessionChoice,
  mergeModelSettings,
  modelEffortSetting,
  modelsFor,
  resolveModel,
} from "../../sessions/model/models";
import {
  HARNESSES,
  HARNESS_LABEL,
  RUNTIME_MODES,
  type Attachment,
  type HarnessId,
  type RuntimeMode,
} from "../../sessions/model/session";
import { pathKey } from "../../../shared/lib/paths";
import type { CompanionSessionOptions } from "./protocol";

export class CompanionLaunchError extends Error {}

/** What a phone may pick for a new session in one project, with its defaults. */
export function companionSessionOptions(
  project: string,
  defaultRuntimeMode: RuntimeMode,
): CompanionSessionOptions {
  const choice = defaultSessionChoice(project);
  return {
    project,
    defaults: {
      harness: choice.harness,
      model: resolveModel(choice.harness, choice.model).id,
      runtimeMode: defaultRuntimeMode,
    },
    harnesses: HARNESSES.filter(isHarnessAvailable).map((harness) => ({
      id: harness,
      label: HARNESS_LABEL[harness],
      models: modelsFor(harness).map((model) => {
        const effort = modelEffortSetting(model);
        return {
          id: model.id,
          name: model.name,
          ...(effort
            ? {
                effort: {
                  value: effort.value,
                  options: effort.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  })),
                },
              }
            : {}),
        };
      }),
    })),
  };
}

function text(value: unknown, name: string, max = 400): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new CompanionLaunchError(`${name} must be text`);
  return value.trim();
}

/**
 * A new project session from the phone, checked like the `app` CLI's
 * `sessions.start`: a rail project, an installed provider, a known model and
 * effort, and one of the four permission modes. It never takes the user's
 * desktop focus.
 */
export function companionLaunch(
  input: Record<string, unknown>,
  context: {
    projects: readonly string[];
    defaultRuntimeMode: RuntimeMode;
    attachments: Attachment[];
    prompt: string;
  },
): QuickLaunch {
  const requested = text(input.project, "project", 4096);
  const cwd = context.projects.find(
    (path) => requested && pathKey(path) === pathKey(requested),
  );
  if (!cwd) throw new CompanionLaunchError("Choose one of the projects on the rail");

  const defaults = defaultSessionChoice(cwd);
  const harness = (text(input.harness, "harness") ?? defaults.harness) as HarnessId;
  if (!HARNESSES.includes(harness) || !isHarnessAvailable(harness))
    throw new CompanionLaunchError(`${harness} is not available in MOLFAR`);

  const modelId = text(input.model, "model");
  const model = modelId
    ? modelsFor(harness).find((entry) => entry.id === modelId)
    : resolveModel(harness, harness === defaults.harness ? defaults.model : undefined);
  if (!model || model.harness !== harness)
    throw new CompanionLaunchError("Unknown model for this provider");

  const settings: Record<string, string> = {};
  const effortValue = text(input.effort, "effort", 128);
  if (effortValue) {
    const effort = modelEffortSetting(model);
    if (!effort?.options.some((option) => option.value === effortValue))
      throw new CompanionLaunchError(`${model.name} does not offer that effort`);
    settings[effort.id] = effortValue;
  }

  const runtimeMode = input.runtimeMode ?? context.defaultRuntimeMode;
  if (!RUNTIME_MODES.includes(runtimeMode as RuntimeMode))
    throw new CompanionLaunchError(`runtimeMode must be one of ${RUNTIME_MODES.join(", ")}`);

  const workspaceMode = input.workspaceMode ?? "current";
  if (workspaceMode !== "current" && workspaceMode !== "worktree")
    throw new CompanionLaunchError("workspaceMode must be current or worktree");

  return {
    cwd,
    prompt: context.prompt,
    harness,
    model: model.id,
    modelSettings: mergeModelSettings(model, settings),
    runtimeMode: runtimeMode as RuntimeMode,
    workspaceMode,
    ...(context.attachments.length ? { attachments: context.attachments } : {}),
    reveal: false,
  };
}
