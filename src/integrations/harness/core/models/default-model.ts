import type { HarnessId } from "@/domain/harness/harness";
import type { AgentModel } from "@/domain/models/agent-model";
import { DEFAULT_MODEL_ID } from "./catalog";

export function pickDefaultId(
  harness: HarnessId,
  models: AgentModel[],
): string {
  if (harness === "claude") {
    return (
      models.find((model) => model.nativeId === "claude-sonnet-5")?.id ??
      models.find((model) => model.nativeId === "sonnet")?.id ??
      models.find((model) => model.id === DEFAULT_MODEL_ID.claude)?.id ??
      models[0]?.id ??
      DEFAULT_MODEL_ID.claude
    );
  }
  if (harness === "cursor") {
    return (
      models.find((model) => model.nativeId === "composer-2.5")?.id ??
      models.find(
        (model) => model.nativeId === "default" || model.nativeId === "auto",
      )?.id ??
      models[0]?.id ??
      DEFAULT_MODEL_ID.cursor
    );
  }
  if (harness === "codex") {
    return models[0]?.id ?? "";
  }
  if (harness === "grok") {
    return (
      models.find((model) => model.nativeId === "grok-4.6")?.id ??
      models.find((model) => model.id === DEFAULT_MODEL_ID.grok)?.id ??
      models[0]?.id ??
      DEFAULT_MODEL_ID.grok
    );
  }
  if (harness === "fx") {
    const preferred = [
      "zai/glm-5.2-fast",
      "zai/glm-5.2",
      "zai/glm-4.7-flash",
      "zai/glm-4.7",
      "openai/gpt-5.2",
    ];
    for (const nativeId of preferred) {
      const hit = models.find((model) => model.nativeId === nativeId);
      if (hit) return hit.id;
    }
    return (
      models.find((model) => model.id === DEFAULT_MODEL_ID.fx)?.id ??
      models[0]?.id ??
      DEFAULT_MODEL_ID.fx
    );
  }
  return (
    models.find((model) => model.id === DEFAULT_MODEL_ID[harness])?.id ??
    models[0]?.id ??
    DEFAULT_MODEL_ID[harness]
  );
}
