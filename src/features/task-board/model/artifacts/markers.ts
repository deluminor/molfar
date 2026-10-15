import type { ArtifactKind } from "../../types/artifact";

export const openMarker = (kind: ArtifactKind): string => `<<<MOLFAR:${kind}>>>`;
export const closeMarker = (kind: ArtifactKind): string => `<<<END:${kind}>>>`;

export type ExtractedArtifacts = {
  found: Partial<Record<ArtifactKind, string>>;
  missing: ArtifactKind[];
};

/**
 * Pulls each requested artifact out of an agent's final text. Agents sometimes
 * quote the marker format while explaining their work, so the last complete
 * block of each kind wins.
 */
export function extractArtifacts(
  text: string,
  kinds: readonly ArtifactKind[],
): ExtractedArtifacts {
  const normalized = text.replace(/\r\n?/g, "\n");
  const found: Partial<Record<ArtifactKind, string>> = {};
  const missing: ArtifactKind[] = [];

  for (const kind of kinds) {
    const open = openMarker(kind);
    const close = closeMarker(kind);
    const end = normalized.lastIndexOf(close);
    const start = end < 0 ? -1 : normalized.lastIndexOf(open, end);
    const body = start < 0 ? "" : normalized.slice(start + open.length, end).trim();

    if (body) found[kind] = body;
    else missing.push(kind);
  }

  return { found, missing };
}
