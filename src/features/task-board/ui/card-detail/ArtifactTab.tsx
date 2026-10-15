import { useState, type ReactNode } from "react";
import { MarkdownDocumentPreview } from "../../../sessions/ui/MarkdownDocumentPreview";
import { useArtifactBody } from "../../hooks/use-card-detail";
import type { BoardStorePort } from "../../services/ports";
import type { ArtifactKind } from "../../types/artifact";

type Props = {
  store: BoardStorePort;
  cardId: string;
  kind: ArtifactKind;
  /** Newest first. */
  versions: readonly number[];
  label: string;
  /** Rendered instead of the preview, e.g. an editor or form for this artifact. */
  children?: (body: string, version: number) => ReactNode;
};

export function ArtifactTab({ store, cardId, kind, versions, label, children }: Props): ReactNode {
  const [picked, setPicked] = useState<number | null>(null);
  const version = picked ?? versions[0];
  const { body, error } = useArtifactBody(store, cardId, kind, version);

  if (!version) return <p className="p-4 text-[13px] text-content/40">No {label.toLowerCase()} yet.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {versions.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 text-[12px] text-content/50">
          Version
          <select
            aria-label={`${label} version`}
            value={version}
            onChange={(event) => setPicked(Number(event.target.value))}
            className="h-7 cursor-pointer rounded-md border border-stroke bg-content/[0.03] px-1.5 tabular-nums text-content/80 outline-none"
          >
            {versions.map((entry) => (
              <option key={entry} value={entry}>
                v{entry}
                {entry === versions[0] ? " (latest)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="p-4 text-[12px] text-rose-300">
          {error}
        </p>
      ) : null}
      {body === null && !error ? <p className="p-4 text-[13px] text-content/40">Loading…</p> : null}
      {body !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children ? children(body, version) : <MarkdownDocumentPreview text={body} metadataLabel="Properties" />}
        </div>
      ) : null}
    </div>
  );
}
