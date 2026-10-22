import { Maximize2, FolderTree } from "@/shared/ui/icons";
import type { KnowledgeGraphProps } from "../../model/graph/types";
import { useKnowledgeGraph } from "./use-knowledge-graph";
import "./graph.css";

const CONTROL =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-content/10 bg-background-base px-2.5 text-[12px] text-content/70 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";

const ICON_BUTTON =
  "grid size-7 shrink-0 place-items-center rounded-md border border-content/10 bg-background-base text-content/45 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent max-[480px]:size-11";

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
          type="button"
          className={`${CONTROL} ${
            neighborsOnly ? "border-accent/50 text-accent" : ""
          }`}
          onClick={onToggleNeighborhood}
          aria-pressed={neighborsOnly}
          disabled={!selectedPath}
        >
          <FolderTree className="size-3.5" strokeWidth={1.75} />{" "}
          {neighborsOnly ? "Neighborhood" : "All connections"}
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          onClick={scene.fit}
          aria-label="Fit graph to view"
          disabled={!scene.ready}
        >
          <Maximize2 className="size-3.5" strokeWidth={1.75} />
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
