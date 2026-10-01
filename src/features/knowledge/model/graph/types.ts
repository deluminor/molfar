import type { NodeObject } from "3d-force-graph";
import type { VaultNote } from "../vault/types";

export interface NoteIndex {
  paths: Map<string, VaultNote>;
  names: Map<string, Set<string>>;
}

export interface LinkResolution {
  state: "resolved" | "missing" | "ambiguous" | "attachment";
  path?: string;
}

export interface KnowledgeGraphNode extends NodeObject {
  id: string;
  title: string;
  folder: string;
  degree: number;
}

export interface KnowledgeGraphLink {
  source: string;
  target: string;
}

export interface KnowledgeGraphProjection {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
  total: number;
  missing: number;
  ambiguous: number;
}

export interface KnowledgeGraphProps {
  projection: KnowledgeGraphProjection;
  neighborsOnly: boolean;
  onToggleNeighborhood: () => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}
