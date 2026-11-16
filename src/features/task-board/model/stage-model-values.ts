import { modelEffortSetting } from "@/domain/models/model-settings";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import type { HarnessId } from "@/domain/harness/harness";

function effortSettingId(harness: HarnessId, model: string): string | undefined {
  const entry = modelsFor(harness).find((candidate) => candidate.id === model);
  return entry ? modelEffortSetting(entry)?.id : undefined;
}

/** Column configs store only the effort; the model picker speaks in settings maps. */
export function effortValues(harness: HarnessId, model: string, effort: string | undefined): Record<string, string> {
  const id = effortSettingId(harness, model);
  return id && effort ? { [id]: effort } : {};
}

export function effortFromValues(
  harness: HarnessId,
  model: string,
  values: Record<string, string>,
): string | undefined {
  const id = effortSettingId(harness, model);
  return id ? values[id] : undefined;
}
