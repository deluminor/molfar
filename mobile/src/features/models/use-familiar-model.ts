import { effortLabel } from "@/features/models/modelChoice";
import { useSessionChoice } from "@/features/models/sessionChoice";
import { useModelCatalog } from "@/features/models/useModelCatalog";
import type { Familiar } from "@/features/workspace/types";
import { familiarConversationId } from "@/features/workspace/WorkspaceProvider";

/**
 * The model a Familiar runs with, named as a session's: a pick made on this phone,
 * else what the desktop says its conversation runs with, else the catalog's.
 */
export function useFamiliarModel(familiar: Familiar | undefined) {
  const conversationId = familiar ? familiarConversationId(familiar.id) : undefined;
  const { catalog } = useModelCatalog(conversationId, conversationId);
  const { chosen } = useSessionChoice(undefined, conversationId);
  const current = chosen?.pick ?? catalog?.current;
  const entry = catalog?.models.find((model) => model.id === current?.model);
  return {
    conversationId,
    model: chosen?.name ?? entry?.name ?? current?.model ?? familiar?.model ?? "",
    harness: current?.harness ?? familiar?.harness,
    effort: current ? effortLabel(entry, current) : undefined,
  };
}
