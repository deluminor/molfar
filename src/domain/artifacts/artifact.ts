/** Extend this union when a renderer and storage support for a new kind exist. */
export type ArtifactKind = "document" | "html";
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["document", "html"];
export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  body: string;
  sourceSessionId?: string;
  sourceCwd?: string;
  createdAt: number;
  updatedAt: number;
};
export type ArtifactUpsert = Omit<Artifact, "createdAt" | "updatedAt">;
export type ArtifactCard = Pick<Artifact, "id" | "kind" | "title"> & {
  summary?: string;
};
