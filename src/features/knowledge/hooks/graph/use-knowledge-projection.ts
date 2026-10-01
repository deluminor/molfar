import { useCallback, useMemo, useState } from "react";
import { projectKnowledgeGraph } from "../../model/graph/project-graph";
import type { VaultNote } from "../../model/vault/types";

export function useKnowledgeProjection(
  notes: VaultNote[],
  selectedPath: string | null,
  query: string,
) {
  const [neighborsOnly, setNeighborsOnly] = useState(false);
  const projection = useMemo(
    () => projectKnowledgeGraph(notes, selectedPath, query, neighborsOnly),
    [notes, selectedPath, query, neighborsOnly],
  );
  const toggleNeighborhood = useCallback(
    () => setNeighborsOnly((current) => !current),
    [],
  );

  return { projection, neighborsOnly, toggleNeighborhood };
}
