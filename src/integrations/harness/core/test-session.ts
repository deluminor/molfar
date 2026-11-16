import type { HarnessId } from "@/domain/harness/harness";
import { blankSession } from "@/domain/session/blank-session";
import {
  DEFAULT_RUNTIME_MODE,
  type RuntimeMode,
} from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import { defaultModelId } from "./models/catalog-store";
import { mergeModelSettings, resolveModel } from "./models/resolve-model";

/**
 * The sessions feature's `newSession` without the user's saved model
 * preferences, for harness tests that need a session the app would create.
 */
export function testSession(
  harness: HarnessId = "claude",
  cwd = "~",
  model?: string,
  runtimeMode: RuntimeMode = DEFAULT_RUNTIME_MODE,
  modelSettings?: Record<string, string>,
): Session {
  const resolved = resolveModel(harness, model ?? defaultModelId(harness));
  return blankSession(
    harness,
    cwd,
    resolved.id,
    mergeModelSettings(resolved, modelSettings),
    runtimeMode,
  );
}
