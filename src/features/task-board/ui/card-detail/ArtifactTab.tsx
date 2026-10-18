import { useState, type ReactNode } from "react";
import { MarkdownDocumentPreview } from "@/features/sessions/ui/MarkdownDocumentPreview";
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
  /** Replaces the preview; it must fill the remaining height and scroll itself. */
  children?: (body: string, version: number) => ReactNode;
};

function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }): ReactNode {
  const color = tone === "error" ? "text-rose-300" : "text-content/40";
  return <p role={tone === "error" ? "alert" : undefined} className={`px-4 py-6 text-[13px] ${color}`}>{children}</p>;
}

/** One artifact with its version picker. The preview scrolls on its own; forms bring their own scroll. */
export function ArtifactTab({ store, cardId, kind, versions, label, children }: Props): ReactNode {
  const [picked, setPicked] = useState<number | null>(null);
  const version = picked ?? versions[0];
  const { body, error } = useArtifactBody(store, cardId, kind, version);

  if (!version) return <Notice>No {label.toLowerCase()} yet.</Notice>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {versions.length > 1 ? (
        <div className="flex shrink-0 items-center gap-1 px-4 pt-3" role="radiogroup" aria-label={`${label} version`}>
          {versions.map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={entry === version}
              onClick={() => setPicked(entry)}
              className={`h-6 cursor-pointer rounded-md px-2 text-[11.5px] tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 ${entry === version ? "bg-content/[0.09] text-content" : "text-content/45 hover:bg-content/[0.05] hover:text-content/80"}`}
            >
              v{entry}
              {entry === versions[0] ? <span className="ml-1 text-content/35">latest</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {body === null && !error ? <Notice>Loading…</Notice> : null}
      {body !== null && children ? children(body, version) : null}
      {body !== null && !children ? (
        <div className="min-h-0 flex-1">
          <MarkdownDocumentPreview text={body} metadataLabel="Properties" />
        </div>
      ) : null}
    </div>
  );
}
