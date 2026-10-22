import type { AgentModel, ModelSetting } from "./agent-model";

export function defaultModelSettings(
  model: AgentModel,
): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const setting of model.settings ?? []) {
    settings[setting.id] = setting.value;
  }
  return settings;
}

const EFFORT_SETTING_IDS = new Set([
  "effort",
  "reasoning",
  "reasoningEffort",
  // Pi and OMP expose their reasoning level as a `thinking` select.
  "thinking",
  // OpenCode exposes reasoning levels as `variant`; treat it as effort so the
  // standalone effort control and dedup behave like Codex/Cursor/Grok.
  "variant",
]);

/** True for the select setting ids that control reasoning effort. */
export function isEffortSettingId(id: string): boolean {
  return EFFORT_SETTING_IDS.has(id);
}

/** The select setting that controls reasoning effort for this model, if any. */
export function modelEffortSetting(
  model: AgentModel,
): ModelSetting | undefined {
  return model.settings?.find(
    (setting) =>
      setting.kind === "select" && EFFORT_SETTING_IDS.has(setting.id),
  );
}

export function modelEffortLabel(
  model: AgentModel,
  values?: Record<string, string>,
): string | undefined {
  const setting = modelEffortSetting(model);
  if (!setting) return undefined;
  const value = values?.[setting.id] ?? setting.value;
  return (
    setting.options.find((option) => option.value === value)?.label ?? value
  );
}

/** Cursor CLI uses `extra-high`; Claude uses `xhigh`. */
const SETTING_VALUE_ALIASES: Record<string, string> = {
  "extra-high": "xhigh",
  xhigh: "extra-high",
};

export function compatibleSettingValue(
  setting: ModelSetting,
  value: string | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (setting.options.some((option) => option.value === value)) return value;
  const alias = SETTING_VALUE_ALIASES[value];
  if (alias && setting.options.some((option) => option.value === alias)) {
    return alias;
  }
  return undefined;
}
