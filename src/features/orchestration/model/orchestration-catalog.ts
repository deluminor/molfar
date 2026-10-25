import { HARNESSES } from "@/domain/harness/harness";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import {
  isHarnessAvailable,
  probeHarnessAvailability,
} from "@/integrations/harness/core/availability";
import { refreshHarnessCatalogs } from "@/integrations/harness/core/registry";
import { validateOrchestrationSettings } from "./orchestration-plan";

/** Discover worker choices only when the user sends an orchestration request. */
export async function discoverOrchestrationSettings() {
  await probeHarnessAvailability();
  const installed = HARNESSES.filter(isHarnessAvailable);
  await refreshHarnessCatalogs(installed);
  return validateOrchestrationSettings({
    maxWorkers: 2,
    choices: installed
      .filter(isHarnessAvailable)
      .flatMap((harness) =>
        modelsFor(harness).map(({ id, name }) => ({
          harness,
          model: id,
          name,
        })),
      ),
  });
}
