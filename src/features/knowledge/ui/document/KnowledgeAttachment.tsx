import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { vaultAssetPath } from "../../../../platform/tauri/vault";
import { SecondaryButton } from "../../../../shared/ui/SecondaryButton";
import { KnowledgeAlert } from "../KnowledgeAlert";

export function KnowledgeAttachment({
  vaultId,
  path,
  onClose,
}: {
  vaultId: string;
  path: string;
  onClose: () => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const image = /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(path);
  useEffect(() => {
    let alive = true;
    setSource(null);
    setError(null);
    if (!image) return;
    void vaultAssetPath(vaultId, path)
      .then((absolute) => {
        if (alive) setSource(convertFileSrc(absolute));
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      });
    return () => {
      alive = false;
    };
  }, [vaultId, path, image]);

  return (
    <section className="knowledge-document" aria-label="Attachment preview">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-content">
          {path.split("/").pop()}
        </h2>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      </div>
      {error ? (
        <KnowledgeAlert>{error}</KnowledgeAlert>
      ) : null}
      {image && !source && !error ? (
        <p className="px-4 py-6 text-[12px] text-content/50" role="status">
          Loading attachment…
        </p>
      ) : null}
      {source ? (
        <div className="overflow-auto p-5">
          <img
            src={source}
            alt={path.split("/").pop()}
            className="block h-auto w-full rounded-md"
          />
        </div>
      ) : null}
      {!image ? (
        <p className="px-4 py-6 text-[12px] leading-relaxed text-content/55">
          Preview is not available for this file type. Open it from your vault
          in Obsidian. Markdown notes can be edited and shared with agents here.
        </p>
      ) : null}
    </section>
  );
}
