import type { NoteDraft } from "./types";
const draftsByVault = new Map<string, Record<string, NoteDraft>>();
export function readDrafts(
  root: string | undefined,
): Record<string, NoteDraft> {
  if (!root) return {};
  return draftsByVault.get(root) ?? {};
}
export function retainDrafts(
  root: string,
  drafts: Record<string, NoteDraft>,
): void {
  draftsByVault.set(root, drafts);
}
