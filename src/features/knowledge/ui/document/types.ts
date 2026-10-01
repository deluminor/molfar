import type { VaultNote, VaultEntry } from "../../model/vault/types";
import type { useVaultDocument } from "../../hooks/documents/use-vault-document";
export type KnowledgeDocumentProps = {
  state: ReturnType<typeof useVaultDocument>;
  path: string;
  vaultId: string;
  notes: VaultNote[];
  entries: VaultEntry[];
  onSelect: (path: string) => void;
  onContext: () => void;
  contextBusy: boolean;
  onClose: () => void;
};
