import { HARNESS_LABEL, type HarnessId } from "../harness/harness";
import type { RuntimeMode } from "./runtime-mode";
import type { Session } from "./session";

/** An empty conversation on a model the caller already resolved. */
export function blankSession(
  harness: HarnessId,
  cwd: string,
  model: string,
  modelSettings: Record<string, string>,
  runtimeMode: RuntimeMode,
): Session {
  return {
    id: crypto.randomUUID(),
    harness,
    model,
    modelSettings,
    runtimeMode,
    title: HARNESS_LABEL[harness],
    cwd,
    blocks: [],
  };
}
