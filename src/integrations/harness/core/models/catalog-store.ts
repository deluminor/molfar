import { type HarnessId, HARNESSES } from "@/domain/harness/harness";
import type { AgentModel } from "@/domain/models/agent-model";
import { DEFAULT_MODEL_ID, MODELS } from "./catalog";
import { pickDefaultId } from "./default-model";

const EMPTY_MODELS: AgentModel[] = [];

let overlays: Partial<Record<HarnessId, AgentModel[]>> = {};
let overlayDefaults: Partial<Record<HarnessId, string>> = {};
let catalogVersion = 0;
const listeners = new Set<() => void>();

function emit() {
  catalogVersion += 1;
  baseByHarness = null;
  indexById = null;
  allCache = null;
  for (const listener of listeners) listener();
}

export function subscribeModels(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getModelSnapshot(): number {
  return catalogVersion;
}

export function setHarnessModels(harness: HarnessId, models: AgentModel[]) {
  if (models.length === 0) return;
  overlays = { ...overlays, [harness]: models };
  overlayDefaults = {
    ...overlayDefaults,
    [harness]: pickDefaultId(harness, models),
  };
  emit();
}

/** True after a live CLI catalog has replaced the built-in fallback list. */
export function hasLiveCatalog(harness: HarnessId): boolean {
  return overlays[harness] != null;
}

/** Test seam. */
export function resetHarnessModelOverlays() {
  overlays = {};
  overlayDefaults = {};
  emit();
}

export function defaultModelId(harness: HarnessId): string {
  return overlayDefaults[harness] ?? DEFAULT_MODEL_ID[harness];
}

// `modelsFor`/`findModel` sit in render bodies (every session card, every
// provider row, the picker itself), so they must not rebuild the catalog on
// each call. These caches are dropped in `emit()` whenever an overlay lands.
let baseByHarness: Partial<Record<HarnessId, AgentModel[]>> | null = null;
let allCache: AgentModel[] | null = null;
let indexById: Map<string, AgentModel> | null = null;

function baseModelsFor(harness: HarnessId): AgentModel[] {
  if (!baseByHarness) {
    const grouped: Partial<Record<HarnessId, AgentModel[]>> = {};
    for (const model of MODELS) {
      (grouped[model.harness] ??= []).push(model);
    }
    baseByHarness = grouped;
  }
  return baseByHarness[harness] ?? EMPTY_MODELS;
}

export function modelsFor(harness: HarnessId): AgentModel[] {
  return overlays[harness] ?? baseModelsFor(harness);
}

export function allModels(): AgentModel[] {
  return (allCache ??= HARNESSES.flatMap(modelsFor));
}

export function findModel(id: string): AgentModel | undefined {
  if (!indexById) {
    const index = new Map<string, AgentModel>();
    // First writer wins, matching the previous `allModels().find(...)` order.
    for (const model of allModels()) {
      if (!index.has(model.id)) index.set(model.id, model);
    }
    indexById = index;
  }
  return indexById.get(id);
}

/** The bundled list never changes, so index it once for `lookupModel`. */
export const bundledById = new Map(MODELS.map((model) => [model.id, model]));

/**
 * Catalog entry for a saved model id, live list first and bundled list second.
 *
 * A live overlay replaces the bundled list rather than adding to it, so a
 * model the CLI stops advertising misses `findModel` entirely. Falling back to
 * the bundle keeps the full native id (`claude:opus-5-5` → `claude-opus-5-5`)
 * instead of re-deriving one from the key, which strips the provider prefix
 * and hands the CLI an id it rejects.
 */
export function lookupModel(id: string): AgentModel | undefined {
  return findModel(id) ?? bundledById.get(id);
}
