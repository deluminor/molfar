import type { HarnessId } from "@/domain/harness/harness";
import type { AgentModel } from "@/domain/models/agent-model";
import {
  defaultModelSettings,
  compatibleSettingValue,
} from "@/domain/models/model-settings";
import {
  nativeIdFrom,
  comparableNativeId,
  nativeIdForUnknownKey,
  claudeNativeId,
} from "@/domain/models/native-id";
import {
  modelsFor,
  findModel,
  bundledById,
  defaultModelId,
  lookupModel,
} from "./catalog-store";

export function resolveModel(harness: HarnessId, id?: string): AgentModel {
  const available = modelsFor(harness);
  if (id) {
    const exact = findModel(id);
    if (exact && exact.harness === harness) return exact;
    const slug = nativeIdFrom(id);
    const byNative = available.find(
      (model) => (model.nativeId ?? nativeIdFrom(model.id)) === slug,
    );
    if (byNative) return byNative;
    // Keep moving Claude aliases as aliases until the CLI advertises them.
    if (harness === "claude" && /^(opus|sonnet|haiku)$/.test(slug)) {
      return {
        id: `claude:${slug}`,
        harness,
        name: `Claude ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`,
        nativeId: slug,
      };
    }
    // A versioned id may differ only by Claude's provider prefix. Do not
    // resolve it to a moving alias or another version via a prefix match.
    const comparableSlug = comparableNativeId(harness, slug);
    const hits = available.filter((model) => {
      const native = model.nativeId ?? nativeIdFrom(model.id);
      const comparableNative = comparableNativeId(harness, native);
      return (
        comparableNative.startsWith(comparableSlug) ||
        comparableSlug.startsWith(comparableNative)
      );
    });
    if (/\d/.test(comparableSlug)) {
      const same = hits.find(
        (model) =>
          comparableNativeId(
            harness,
            model.nativeId ?? nativeIdFrom(model.id),
          ) === comparableSlug,
      );
      if (same) return same;
      if (
        harness !== "claude" &&
        hits.length === 1 &&
        !/\d/.test(
          comparableNativeId(
            harness,
            hits[0].nativeId ?? nativeIdFrom(hits[0].id),
          ),
        )
      )
        return hits[0];
    } else if (hits.length === 1) {
      return hits[0];
    } else if (hits.length > 0) {
      return hits[0];
    }
    const bundled = bundledById.get(id);
    if (bundled && bundled.harness === harness) return bundled;

    // A saved concrete Claude version may be absent from both catalogs.
    // Keep the requested id so a new session does not silently switch models.
    const requested = id.trim();
    if (harness === "claude" && /^claude:[a-z][a-z0-9-]*-\d/.test(requested)) {
      const nativeId = nativeIdForUnknownKey(requested);
      return { id: requested, harness, name: nativeId, nativeId };
    }
  }
  // Codex has no built-in catalog. During startup, retain the saved model
  // until discovery finishes instead of borrowing another provider's model.
  if (available.length === 0) {
    const requested = id?.trim() ?? "";
    const modelId =
      requested &&
      (!requested.includes(":") || requested.startsWith(`${harness}:`))
        ? requested
        : "";
    const nativeId = nativeIdFrom(modelId);
    return {
      id: modelId,
      harness,
      name: nativeId
        ? nativeId
            .replace(/^gpt/i, "GPT")
            .replace(
              /-([a-z])/g,
              (_, letter: string) => `-${letter.toUpperCase()}`,
            )
        : harness.charAt(0).toUpperCase() + harness.slice(1),
      nativeId,
    };
  }
  const fallbackId = defaultModelId(harness);
  return (fallbackId ? findModel(fallbackId) : undefined) ?? available[0];
}

/** Catalog-reported context window for a model id, when known. */
export function modelContextWindow(id: string): number | undefined {
  const window = findModel(id)?.contextWindow;
  return window && window > 0 ? window : undefined;
}

export function nativeModelId(model: AgentModel | string): string {
  if (typeof model !== "string") {
    return claudeNativeId(
      model.harness,
      model.nativeId ?? nativeIdFrom(model.id),
    );
  }
  const found = lookupModel(model);
  if (found) {
    return claudeNativeId(
      found.harness,
      found.nativeId ?? nativeIdFrom(found.id),
    );
  }
  return nativeIdForUnknownKey(model);
}

export function mergeModelSettings(
  model: AgentModel,
  current?: Record<string, string>,
): Record<string, string> {
  if (modelsFor(model.harness).length === 0) return { ...current };
  const next = defaultModelSettings(model);
  if (!current) return next;
  for (const setting of model.settings ?? []) {
    const value = compatibleSettingValue(setting, current[setting.id]);
    if (value != null) next[setting.id] = value;
  }
  return next;
}

/** Compound launch id, e.g. `claude-opus-4-8[effort=high,fast=false]`. */
export function encodeModelLaunchId(
  modelId: string,
  settings?: Record<string, string>,
): string {
  const model = lookupModel(modelId);
  const native = nativeModelId(model ?? modelId);
  const defs = model?.settings ?? [];
  if (!native || defs.length === 0) return native;
  const parts = defs.map(
    (setting) => `${setting.id}=${settings?.[setting.id] ?? setting.value}`,
  );
  return `${native}[${parts.join(",")}]`;
}
