import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { AgentMarkdown } from "../../../sessions/ui/AgentMarkdown";
import { X } from "../../../../shared/ui/icons";
import { prepareVaultPreview } from "../../model/document/prepare-vault-preview";
import { useVaultAssets } from "../../hooks/documents/use-vault-assets";
import type { KnowledgeDocumentProps } from "./types";

export function KnowledgeDocument({
  state,
  path,
  vaultId,
  notes,
  entries,
  onSelect,
  onContext,
  contextBusy,
  onClose,
}: KnowledgeDocumentProps) {
  const [preview, setPreview] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const markdown = useMemo(
    () => prepareVaultPreview(state.draft?.body ?? "", notes, path, entries),
    [state.draft?.body, notes, path, entries],
  );
  const assets = useVaultAssets(preview ? vaultId : undefined, markdown);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (state.dirty && !state.saving && !state.draft?.conflict)
          void state.save();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [state]);
  const change = (event: ChangeEvent<HTMLTextAreaElement>) =>
    state.change(event.target.value);
  const source = () => setPreview(false);
  const rendered = () => setPreview(true);
  const link = (event: MouseEvent<HTMLDivElement>) => {
    const anchor =
      event.target instanceof Element ? event.target.closest("a") : null;
    const href = anchor?.getAttribute("href");
    if (!href?.startsWith("#knowledge=")) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      onSelect(decodeURIComponent(href.slice(11)));
      setLinkError(null);
    } catch (failure: unknown) {
      setLinkError(String(failure));
    }
  };

  return (
    <section className="knowledge-document" aria-label="Note editor">
      <div className="knowledge-document-heading">
        <div>
          <span className="knowledge-eyebrow">NOTE</span>
          <h2>{path.split("/").pop()}</h2>
          <span className="knowledge-document-path" title={path}>
            {path}
          </span>
        </div>
        <button
          className="knowledge-icon-button"
          aria-label="Close note"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="knowledge-document-toolbar">
        <div className="knowledge-tabs">
          <button onClick={source} aria-pressed={!preview}>
            Source
          </button>
          <button onClick={rendered} aria-pressed={preview}>
            Preview
          </button>
        </div>
        <span className="knowledge-muted">
          {state.dirty ? "Unsaved changes" : "Saved"}
        </span>
        <button
          className="knowledge-button knowledge-primary"
          onClick={state.save}
          disabled={
            !state.dirty || state.saving || Boolean(state.draft?.conflict)
          }
        >
          {state.saving ? "Saving…" : "Save"}
        </button>
      </div>
      {linkError && (
        <div className="knowledge-error" role="alert">
          {linkError}
        </div>
      )}
      {assets.error && (
        <div className="knowledge-error" role="alert">
          {assets.error}
        </div>
      )}
      {state.error && (
        <div className="knowledge-error" role="alert">
          {state.error}
        </div>
      )}
      {state.draft?.conflict && (
        <div className="knowledge-conflict">
          <p>
            The file changed or saving failed. Your draft is kept. Load the
            current file before trying again; your draft will stay in the
            editor.
          </p>
          <button className="knowledge-button" onClick={state.reload}>
            Load current revision
          </button>
        </div>
      )}
      {state.loading && (
        <p className="knowledge-empty" role="status">
          Opening note…
        </p>
      )}
      {state.draft && !preview && (
        <textarea
          className="knowledge-source"
          aria-label="Markdown source"
          value={state.draft.body}
          onChange={change}
          spellCheck={false}
        />
      )}
      {state.draft && preview && (
        <div className="knowledge-preview" onClickCapture={link}>
          <AgentMarkdown
            text={markdown}
            allowRemoteMedia={false}
            localImageSources={assets.sources}
          />
        </div>
      )}
      <footer className="knowledge-document-footer">
        <button
          className="knowledge-button"
          onClick={onContext}
          disabled={
            contextBusy ||
            !state.draft ||
            state.dirty ||
            state.saving ||
            state.draft.conflict
          }
        >
          {contextBusy ? "Preparing context…" : "Add to agent context"}
        </button>
        {state.dirty && (
          <button className="knowledge-button" onClick={state.discard}>
            Discard draft
          </button>
        )}
        <span className="knowledge-muted">
          {state.draft?.body.length.toLocaleString() ?? 0} characters
        </span>
      </footer>
    </section>
  );
}
