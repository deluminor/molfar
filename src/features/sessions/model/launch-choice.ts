import { mergeModelSettings, resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { modelEffortSetting } from "@/domain/models/model-settings";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import { HARNESSES, HARNESS_LABEL, type HarnessId } from "@/domain/harness/harness";
import { RUNTIME_MODES, type RuntimeMode } from "@/domain/session/runtime-mode";
import { isHarnessAvailable } from "@/integrations/harness/core/availability";
import { defaultSessionChoice } from "./models";

export class LaunchChoiceError extends Error {}

/** Installed providers, their models and efforts, and the project's defaults. */
export type LaunchOptions = {
  project: string;
  defaults: { harness: string; model: string; runtimeMode: RuntimeMode };
  harnesses: {
    id: string;
    label: string;
    models: {
      id: string;
      name: string;
      effort?: { value: string; options: { value: string; label: string }[] };
    }[];
  }[];
};

export type LaunchChoice = {
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
};

export function launchOptions(
  project: string,
  defaultRuntimeMode: RuntimeMode,
): LaunchOptions {
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

export function launchText(
  value: unknown,
  name: string,
  max = 400,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new LaunchChoiceError(`${name} must be text`);
  return value.trim();
}

/**
 * Checks a requested provider, model, effort and permission mode against what
 * is installed, falling back to the project's defaults for omitted fields.
 */
export function resolveLaunchChoice(
  cwd: string,
  input: Record<string, unknown>,
  defaultRuntimeMode: RuntimeMode,
): LaunchChoice {
  const defaults = defaultSessionChoice(cwd);
  const harness = (launchText(input.harness, "harness") ?? defaults.harness) as HarnessId;
  if (!HARNESSES.includes(harness) || !isHarnessAvailable(harness))
    throw new LaunchChoiceError(`${harness} is not available in MOLFAR`);

  const modelId = launchText(input.model, "model");
  const model = modelId
    ? modelsFor(harness).find((entry) => entry.id === modelId)
    : resolveModel(harness, harness === defaults.harness ? defaults.model : undefined);
  if (!model || model.harness !== harness)
    throw new LaunchChoiceError("Unknown model for this provider");

  const settings: Record<string, string> = {};
  const effortValue = launchText(input.effort, "effort", 128);
  if (effortValue) {
    const effort = modelEffortSetting(model);
    if (!effort?.options.some((option) => option.value === effortValue))
      throw new LaunchChoiceError(`${model.name} does not offer that effort`);
    settings[effort.id] = effortValue;
  }

  const runtimeMode = input.runtimeMode ?? defaultRuntimeMode;
  if (!RUNTIME_MODES.includes(runtimeMode as RuntimeMode))
    throw new LaunchChoiceError(`runtimeMode must be one of ${RUNTIME_MODES.join(", ")}`);

  return {
    harness,
    model: model.id,
    modelSettings: mergeModelSettings(model, settings),
    runtimeMode: runtimeMode as RuntimeMode,
  };
}
