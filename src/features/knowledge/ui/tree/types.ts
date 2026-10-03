import type { VaultEntry } from "../../model/vault/types";
export type KnowledgeTreeProps = {
  entries: VaultEntry[];
  dirtyPaths?: ReadonlySet<string>;
  query: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
};
export type EntryNode = { entry: VaultEntry; children: EntryNode[] };
