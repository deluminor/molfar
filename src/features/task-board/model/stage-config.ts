import { resolveLaunchChoice, type LaunchChoice } from "../../sessions/model/launch-choice";
import { HARNESSES, RUNTIME_MODES, type RuntimeMode } from "../../sessions/model/session";
import { AGENT_STAGES } from "../constants/columns";
import type { BoardSettings } from "../types/settings";
import type { AgentStage, StageModelConfig, StageOverrides } from "../types/stage";

const STAGE_DEFAULT_MODE: RuntimeMode = "auto";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function partialConfig(value: unknown): Partial<StageModelConfig> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const config: Partial<StageModelConfig> = {};
  const harness = text(raw.harness);
  const model = text(raw.model);
  const effort = text(raw.effort);
  const mode = text(raw.runtimeMode);

  const known = HARNESSES.find((entry) => entry === harness);
  if (known) config.harness = known;
  if (model) config.model = model;
  if (effort) config.effort = effort;
  const runtimeMode = RUNTIME_MODES.find((entry) => entry === mode);
  if (runtimeMode) config.runtimeMode = runtimeMode;
  return config;
}

/** Card overrides are stored as JSON; anything unrecognized is dropped, never trusted. */
export function parseOverrides(json: string): StageOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const overrides: StageOverrides = {};
  for (const stage of AGENT_STAGES) {
    const config = partialConfig((parsed as Record<string, unknown>)[stage]);
    if (Object.keys(config).length) overrides[stage] = config;
  }
  return overrides;
}

/**
 * A card override wins field by field. Switching provider drops the column's
 * model and effort, which belong to the column's provider.
 */
export function mergeStageConfig(
  column: StageModelConfig | undefined,
  override: Partial<StageModelConfig> | undefined,
): Partial<StageModelConfig> {
  const base: Partial<StageModelConfig> = { ...column };
  const switchesProvider = override?.harness && override.harness !== base.harness;
  if (switchesProvider) {
    delete base.model;
    delete base.effort;
  }
  return { ...base, ...override };
}

export function resolveStageConfig(
  stage: AgentStage,
  cwd: string,
  settings: BoardSettings,
  overridesJson: string,
): LaunchChoice {
  const merged = mergeStageConfig(settings.columns[stage], parseOverrides(overridesJson)[stage]);
  return resolveLaunchChoice(cwd, merged, STAGE_DEFAULT_MODE);
}
