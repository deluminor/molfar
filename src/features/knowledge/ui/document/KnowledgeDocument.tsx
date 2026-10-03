import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { AgentMarkdown } from "../../../sessions/ui/AgentMarkdown";
import { X } from "../../../../shared/ui/icons";
import { SecondaryButton } from "../../../../shared/ui/SecondaryButton";
import { prepareVaultPreview } from "../../model/document/prepare-vault-preview";
import { useVaultAssets } from "../../hooks/documents/use-vault-assets";
import { ACTION_FILLED, ICON_BUTTON } from "../constants";
import { KnowledgeAlert } from "../KnowledgeAlert";
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
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-medium text-content">
            {path.split("/").pop()}
          </h2>
          <span
            className="mt-0.5 block truncate text-[11px] text-content/45"
            title={path}
          >
            {path}
          </span>
        </div>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Close note"
          onClick={onClose}
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex items-center gap-2 border-y border-stroke px-3 py-2">
        <div className="flex rounded-md bg-content/[0.04] p-0.5">
          <button
            type="button"
            onClick={source}
            aria-pressed={!preview}
            className={`rounded px-2.5 py-1 text-[11px] ${
              !preview
                ? "bg-content/10 text-content"
                : "text-content/50 hover:text-content"
            }`}
          >
            Source
          </button>
          <button
            type="button"
            onClick={rendered}
            aria-pressed={preview}
            className={`rounded px-2.5 py-1 text-[11px] ${
              preview
                ? "bg-content/10 text-content"
                : "text-content/50 hover:text-content"
            }`}
          >
            Preview
          </button>
        </div>
        <span className="ml-auto text-[11px] text-content/45">
          {state.dirty ? "Unsaved changes" : "Saved"}
        </span>
        <button
          type="button"
          className={`${ACTION_FILLED} h-6.5`}
          onClick={() => void state.save()}
          disabled={
            !state.dirty || state.saving || Boolean(state.draft?.conflict)
          }
        >
          {state.saving ? "Saving…" : "Save"}
        </button>
      </div>
      {linkError ? (
        <KnowledgeAlert>{linkError}</KnowledgeAlert>
      ) : null}
      {assets.error ? (
        <KnowledgeAlert>{assets.error}</KnowledgeAlert>
      ) : null}
      {state.error ? (
        <KnowledgeAlert>{state.error}</KnowledgeAlert>
      ) : null}
      {state.draft?.conflict ? (
        <div className="border-b border-stroke bg-content/[0.03] px-4 py-3">
          <p className="mb-2 text-[12px] leading-relaxed text-content/60">
            The file changed or saving failed. Your draft is kept. Load the
            current file before trying again; your draft will stay in the
            editor.
          </p>
          <SecondaryButton onClick={() => void state.reload()}>
            Load current revision
          </SecondaryButton>
        </div>
      ) : null}
      {state.loading ? (
        <p className="px-4 py-6 text-[12px] text-content/50" role="status">
          Opening note…
        </p>
      ) : null}
      {state.draft && !preview ? (
        <textarea
          className="knowledge-source"
          aria-label="Markdown source"
          value={state.draft.body}
          onChange={change}
          spellCheck={false}
        />
      ) : null}
      {state.draft && preview ? (
        <div className="knowledge-preview" onClickCapture={link}>
          <AgentMarkdown
            text={markdown}
            allowRemoteMedia={false}
            localImageSources={assets.sources}
          />
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center gap-2 border-t border-stroke px-3 py-2.5">
        <SecondaryButton
          onClick={() => void onContext()}
          disabled={
            contextBusy ||
            !state.draft ||
            state.dirty ||
            state.saving ||
            state.draft.conflict
          }
        >
          {contextBusy ? "Preparing context…" : "Add to agent context"}
        </SecondaryButton>
        {state.dirty ? (
          <SecondaryButton onClick={state.discard}>
            Discard draft
          </SecondaryButton>
        ) : null}
        <span className="ml-auto text-[11px] text-content/45">
          {state.draft?.body.length.toLocaleString() ?? 0} characters
        </span>
      </footer>
    </section>
  );
}
