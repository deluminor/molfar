import type { KnowledgeGraphProjection } from "../model/graph/types";

export type KnowledgeViewProps = {
  besideRail?: boolean;
  compactRail?: boolean;
  onClose: () => void;
  onToggleSidebar?: () => void;
};
export type PendingExit = "close" | "disconnect" | null;

export type KnowledgeStatusProps = {
  vault: ReturnType<typeof import("../hooks/vault/use-vault").useVault>;
  graph: KnowledgeGraphProjection;
  hasDirty: boolean;
};
