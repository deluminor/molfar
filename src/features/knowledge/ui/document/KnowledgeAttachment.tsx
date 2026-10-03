import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { vaultAssetPath } from "../../../../platform/tauri/vault";

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
      <div className="knowledge-document-heading">
        <h2>{path.split("/").pop()}</h2>
        <button className="knowledge-button" onClick={onClose}>
          Close
        </button>
      </div>
      {error && (
        <div className="knowledge-error" role="alert">
          {error}
        </div>
      )}
      {image && !source && !error && (
        <p className="knowledge-empty" role="status">
          Loading attachment…
        </p>
      )}
      {source && (
        <div className="knowledge-attachment">
          <img src={source} alt={path.split("/").pop()} />
        </div>
      )}
      {!image && (
        <p className="knowledge-empty">
          Preview is not available for this file type. Open it from your vault
          in Obsidian. Markdown notes can be edited and shared with agents here.
        </p>
      )}
    </section>
  );
}
