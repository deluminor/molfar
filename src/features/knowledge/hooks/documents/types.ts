import type { VaultDocument } from "../../model/vault/types";
export type NoteDraft = {
  saved: VaultDocument;
  body: string;
  conflict: boolean;
};
