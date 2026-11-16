import { beforeEach, describe, expect, it } from "vitest";
import type { AgentModel } from "@/domain/models/agent-model";
import { MODELS } from "./catalog";
import { resetHarnessModelOverlays, setHarnessModels } from "./catalog-store";
import {
  encodeModelLaunchId,
  nativeModelId,
  resolveModel,
} from "./resolve-model";

/**
 * A bundled entry may omit `nativeId`, which means "the key minus the harness
 * prefix is the native id" (`opencode:glm-5` → `glm-5`). An explicit `""` means
 * "omit --model and let the CLI choose", which is a real value.
 */
function expectedNative(id: string, nativeId?: string): string {
  if (nativeId !== undefined) return nativeId;
  const colon = id.indexOf(":");
  return colon >= 0 ? id.slice(colon + 1) : id;
}

function bundledByHarness(): Map<string, AgentModel[]> {
  const grouped = new Map<string, AgentModel[]>();
  for (const model of MODELS) {
    const list = grouped.get(model.harness) ?? [];
    list.push(model);
    grouped.set(model.harness, list);
  }
  return grouped;
}

describe("every bundled model resolves to its own native id", () => {
  beforeEach(() => resetHarnessModelOverlays());

  it("with no live catalog (first turn after launch)", () => {
    const wrong: string[] = [];
    for (const [harness, models] of bundledByHarness()) {
      for (const model of models) {
        const got = nativeModelId(model.id);
        const want = expectedNative(model.id, model.nativeId);
        if (got !== want) {
          wrong.push(`${harness}  ${model.id}  want ${want}  got ${got}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("with a live catalog that dropped the model (stale overlay)", () => {
    const wrong: string[] = [];
    for (const [harness, models] of bundledByHarness()) {
      setHarnessModels(harness as never, [models[0]]);
      for (const model of models) {
        const got = nativeModelId(model.id);
        const want = expectedNative(model.id, model.nativeId);
        if (got !== want) {
          wrong.push(`${harness}  ${model.id}  want ${want}  got ${got}`);
        }
      }
      resetHarnessModelOverlays();
    }
    expect(wrong).toEqual([]);
  });

  it("resolveModel never returns a model from another harness", () => {
    const wrong: string[] = [];
    for (const [harness, models] of bundledByHarness()) {
      setHarnessModels(harness as never, [models[0]]);
      for (const model of models) {
        const resolved = resolveModel(harness as never, model.id);
        if (resolved.harness !== harness) {
          wrong.push(
            `${harness}  ${model.id}  resolved to ${resolved.id} (${resolved.harness})`,
          );
        }
      }
      resetHarnessModelOverlays();
    }
    expect(wrong).toEqual([]);
  });

  it("encodeModelLaunchId never drops a provider prefix", () => {
    const wrong: string[] = [];
    for (const [harness, models] of bundledByHarness()) {
      setHarnessModels(harness as never, [models[0]]);
      for (const model of models) {
        const launch = encodeModelLaunchId(model.id, { effort: "high" });
        const base = launch.split("[")[0];
        const want = expectedNative(model.id, model.nativeId);
        if (base !== want) {
          wrong.push(`${harness}  ${model.id}  want ${want}  got ${base}`);
        }
      }
      resetHarnessModelOverlays();
    }
    expect(wrong).toEqual([]);
  });
});
