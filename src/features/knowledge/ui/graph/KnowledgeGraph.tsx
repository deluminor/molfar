import { Maximize2, FolderTree } from "../../../../shared/ui/icons";
import type { KnowledgeGraphProps } from "../../model/graph/types";
import { useKnowledgeGraph } from "./use-knowledge-graph";
import "./graph.css";

export function KnowledgeGraph({
  projection,
  neighborsOnly,
  onToggleNeighborhood,
  selectedPath,
  onSelect,
}: KnowledgeGraphProps) {
  const scene = useKnowledgeGraph(projection, selectedPath, onSelect);
  let message: string | null = null;
  if (scene.error) message = scene.error;
  else if (projection.total === 0)
    message =
      "Your knowledge graph starts with the Markdown notes in this vault.";
  else if (projection.nodes.length === 0)
    message = "No notes match this view. Try another search.";
  else if (!scene.ready) message = "Preparing your knowledge graph…";

  return (
    <section className="knowledge-graph" aria-label="3D knowledge graph">
      <div
        ref={scene.host}
        className="knowledge-graph-canvas"
        aria-hidden="true"
      />
      <div className="knowledge-graph-controls">
        <button
          className="knowledge-button"
          onClick={onToggleNeighborhood}
          aria-pressed={neighborsOnly}
          disabled={!selectedPath}
        >
          <FolderTree size={14} />{" "}
          {neighborsOnly ? "Neighborhood" : "All connections"}
        </button>
        <button
          className="knowledge-icon-button"
          onClick={scene.fit}
          aria-label="Fit graph to view"
          disabled={!scene.ready}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      {message ? (
        <p className="knowledge-graph-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
