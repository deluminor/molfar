import type { ArtifactDoc, ArtifactKind, ArtifactMeta, ArtifactRef } from "../types/artifact";
import type { BoardStorePort } from "./ports";

export function latestVersions(metas: readonly ArtifactMeta[]): Map<ArtifactKind, number> {
  const latest = new Map<ArtifactKind, number>();
  for (const meta of metas) {
    if (meta.version > (latest.get(meta.kind) ?? 0)) latest.set(meta.kind, meta.version);
  }
  return latest;
}

/** Latest version of each requested kind, in request order; kinds without any version are skipped. */
export async function latestRefs(
  store: BoardStorePort,
  cardId: string,
  kinds: readonly ArtifactKind[],
): Promise<ArtifactRef[]> {
  const latest = latestVersions(await store.listArtifacts(cardId));
  return kinds.flatMap((kind) => {
    const version = latest.get(kind);
    return version ? [{ kind, version }] : [];
  });
}

/** Latest version of each requested kind; kinds without any version are skipped. */
export async function readLatest(
  store: BoardStorePort,
  cardId: string,
  kinds: readonly ArtifactKind[],
): Promise<Partial<Record<ArtifactKind, ArtifactDoc>>> {
  const wanted = await latestRefs(store, cardId, kinds);
  const docs = await Promise.all(
    wanted.map(async ({ kind, version }) => ({
      kind,
      version,
      body: await store.readArtifact(cardId, kind, version),
    })),
  );

  const result: Partial<Record<ArtifactKind, ArtifactDoc>> = {};
  for (const doc of docs) result[doc.kind] = doc;
  return result;
}
