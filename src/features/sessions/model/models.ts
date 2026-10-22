import { type HarnessId, HARNESSES } from "@/domain/harness/harness";
import { loadProjectProviderSettings } from "./project-providers";
import {
  hasProbedHarnessAvailability,
  isHarnessAvailable,
} from "@/integrations/harness/core/availability-state";
import type { AgentModel } from "@/domain/models/agent-model";
import {
  modelsFor,
  defaultModelId,
} from "@/integrations/harness/core/models/catalog-store";
import { mergeModelSettings } from "@/integrations/harness/core/models/resolve-model";

const FAVORITES_KEY = "molfar.favoriteModels";
const MODEL_PICKER_TAB_KEY = "molfar.modelPickerTab";
const HIDDEN_PICKER_PROVIDERS_KEY = "molfar.hiddenPickerProviders";
const LAST_MODEL_KEY = "molfar.lastModel";
const LAST_MODEL_SETTINGS_KEY = "molfar.lastModelSettings";
const DEFAULT_MODELS_KEY = "molfar.defaultModels";
const RECENT_MODELS_KEY = "molfar.recentModels";
const RECENT_MODEL_LIMIT = 6;

export type ModelPickerTab = "favorites" | HarnessId;

export type LastModelChoice = {
  harness: HarnessId;
  model: string;
};

/** Last chosen effort/fast/etc., applied to any model that supports those values. */
export function preferredModelSettings(
  model: AgentModel,
  current?: Record<string, string>,
): Record<string, string> {
  if (modelsFor(model.harness).length === 0) return { ...current };
  return mergeModelSettings(model, {
    ...current,
    ...loadLastModelSettings(),
  });
}

export function loadLastModelSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_MODEL_SETTINGS_KEY);
    if (!raw) return {};
    return parseStringRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveLastModelSettings(
  settings: Record<string, string>,
  mode: "overwrite" | "fill" = "overwrite",
) {
  const prev = loadLastModelSettings();
  const incoming = parseStringRecord(settings);
  const next =
    mode === "fill" ? { ...incoming, ...prev } : { ...prev, ...incoming };
  try {
    localStorage.setItem(LAST_MODEL_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}

export function loadFavoriteModels(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function saveFavoriteModels(ids: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // private mode / quota
  }
}

function isHarnessId(value: string): value is HarnessId {
  return HARNESSES.includes(value as HarnessId);
}

export function loadModelPickerTab(): ModelPickerTab {
  try {
    const raw = localStorage.getItem(MODEL_PICKER_TAB_KEY);
    if (!raw) return "favorites";
    if (raw === "favorites") return "favorites";
    if (isHarnessId(raw)) return raw;
    return "favorites";
  } catch {
    return "favorites";
  }
}

export function saveModelPickerTab(tab: ModelPickerTab) {
  try {
    localStorage.setItem(MODEL_PICKER_TAB_KEY, tab);
  } catch {
    // private mode / quota
  }
}

let pickerVisibilityVersion = 0;
const pickerVisibilityListeners = new Set<() => void>();

function emitPickerVisibility() {
  pickerVisibilityVersion += 1;
  for (const listener of pickerVisibilityListeners) listener();
}

export function subscribePickerVisibility(
  onStoreChange: () => void,
): () => void {
  pickerVisibilityListeners.add(onStoreChange);
  return () => {
    pickerVisibilityListeners.delete(onStoreChange);
  };
}

export function getPickerVisibilitySnapshot(): number {
  return pickerVisibilityVersion;
}

export function loadHiddenPickerProviders(): HarnessId[] {
  try {
    const raw = localStorage.getItem(HIDDEN_PICKER_PROVIDERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is HarnessId => typeof id === "string" && isHarnessId(id),
    );
  } catch {
    return [];
  }
}

export function isPickerProviderVisible(id: HarnessId): boolean {
  return !loadHiddenPickerProviders().includes(id);
}

export function savePickerProviderVisible(id: HarnessId, visible: boolean) {
  const hidden = new Set(loadHiddenPickerProviders());
  if (visible) hidden.delete(id);
  else hidden.add(id);
  try {
    localStorage.setItem(
      HIDDEN_PICKER_PROVIDERS_KEY,
      JSON.stringify([...hidden]),
    );
  } catch {
    // private mode / quota
  }
  emitPickerVisibility();
}

/**
 * Installed providers the user has not hidden appear as picker tabs.
 * Before the first probe we keep them visible so the tab strip does not
 * collapse to Favorites and then jump once CLIs are found.
 */
export function showProviderInModelPicker(
  id: HarnessId,
  installed: boolean,
  probed: boolean,
): boolean {
  if (!isPickerProviderVisible(id)) return false;
  return !probed || installed;
}

export function modelPickerTabs(
  available: (id: HarnessId) => boolean,
): ModelPickerTab[] {
  return ["favorites", ...HARNESSES.filter(available)];
}

export function coerceModelPickerTab(
  tab: ModelPickerTab,
  available: (id: HarnessId) => boolean,
): ModelPickerTab {
  const tabs = modelPickerTabs(available);
  return tabs.includes(tab) ? tab : "favorites";
}

export function stepModelPickerTab(
  tab: ModelPickerTab,
  delta: -1 | 1,
  available: (id: HarnessId) => boolean,
): ModelPickerTab {
  const tabs = modelPickerTabs(available);
  if (tabs.length === 0) return tab;
  const index = tabs.indexOf(tab);
  const from = index < 0 ? 0 : index;
  return tabs[(from + delta + tabs.length) % tabs.length] ?? tab;
}

export function loadDefaultModels(): Partial<Record<HarnessId, string>> {
  try {
    const raw = localStorage.getItem(DEFAULT_MODELS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Partial<Record<HarnessId, string>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isHarnessId(key) && typeof value === "string" && value) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDefaultModel(harness: HarnessId, model: string) {
  const next = { ...loadDefaultModels(), [harness]: model };
  try {
    localStorage.setItem(DEFAULT_MODELS_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}

/** User-picked model for a provider, else the catalog default. */
export function preferredModelId(harness: HarnessId): string {
  const saved = loadDefaultModels()[harness];
  if (saved) return saved;
  const last = loadLastModelChoice();
  if (last?.harness === harness) return last.model;
  return defaultModelId(harness);
}

/**
 * `preferred` unless the project hides it, in which case the first provider the
 * project still allows. Falls back to `preferred` when a project has hidden
 * everything, so a conversation always has a provider.
 */
export function firstEnabledHarness(
  cwd: string | undefined,
  preferred: HarnessId,
): HarnessId {
  const hidden = new Set(loadProjectProviderSettings(cwd).hidden ?? []);
  const enabled = (id: HarnessId) =>
    !hidden.has(id) &&
    showProviderInModelPicker(
      id,
      isHarnessAvailable(id),
      hasProbedHarnessAvailability(),
    );
  if (enabled(preferred)) return preferred;
  return HARNESSES.find(enabled) ?? preferred;
}

/** Provider + model new conversations should start with. */
export function defaultSessionChoice(cwd?: string): LastModelChoice {
  const project = loadProjectProviderSettings(cwd);
  const last = loadLastModelChoice();
  const harness = firstEnabledHarness(
    cwd,
    project.defaultHarness ?? last?.harness ?? "cursor",
  );
  const model =
    project.models?.[harness] ??
    (project.defaultHarness === harness ? project.defaultModel : undefined) ??
    preferredModelId(harness);
  return { harness, model };
}

export function loadLastModelChoice(): LastModelChoice | null {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed != null &&
      "harness" in parsed &&
      "model" in parsed &&
      typeof (parsed as LastModelChoice).harness === "string" &&
      typeof (parsed as LastModelChoice).model === "string" &&
      isHarnessId((parsed as LastModelChoice).harness)
    ) {
      return parsed as LastModelChoice;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastModelChoice(harness: HarnessId, model: string) {
  saveDefaultModel(harness, model);
  try {
    localStorage.setItem(LAST_MODEL_KEY, JSON.stringify({ harness, model }));
  } catch {
    // private mode / quota
  }
}

export function loadRecentModelChoices(): LastModelChoice[] {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const choices: LastModelChoice[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item == null ||
        !("harness" in item) ||
        !("model" in item) ||
        typeof (item as LastModelChoice).harness !== "string" ||
        typeof (item as LastModelChoice).model !== "string" ||
        !isHarnessId((item as LastModelChoice).harness)
      ) {
        continue;
      }
      const choice = item as LastModelChoice;
      const key = `${choice.harness}\0${choice.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push(choice);
      if (choices.length === RECENT_MODEL_LIMIT) break;
    }
    return choices;
  } catch {
    return [];
  }
}

export function saveRecentModelChoice(
  harness: HarnessId,
  model: string,
): LastModelChoice[] {
  const next = [
    { harness, model },
    ...loadRecentModelChoices().filter(
      (choice) => choice.harness !== harness || choice.model !== model,
    ),
  ].slice(0, RECENT_MODEL_LIMIT);
  try {
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
  return next;
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}
