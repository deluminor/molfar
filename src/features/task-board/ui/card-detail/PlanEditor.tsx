import { useState, type ReactNode } from "react";
import { MarkdownDocumentPreview } from "../../../sessions/ui/MarkdownDocumentPreview";
import { MarkdownSourceEditor } from "../../../sessions/ui/MarkdownSourceEditor";
import { OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from "../button-styles";

type Props = {
  body: string;
  editable: boolean;
  onSave: (body: string) => Promise<void>;
};

/** The plan, editable at Plan approval; a save becomes a new plan version. */
export function PlanEditor({ body, editable, onSave }: Props): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (draft === null)
    return (
      <div className="flex flex-col gap-3">
        {editable ? (
          <button type="button" onClick={() => setDraft(body)} className={`${OUTLINE_BUTTON} self-start`}>
            Edit plan
          </button>
        ) : null}
        <MarkdownDocumentPreview text={body} metadataLabel="Properties" />
      </div>
    );

  const save = async () => {
    setBusy(true);
    try {
      await onSave(draft);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <MarkdownSourceEditor value={draft} onChange={setDraft} label="Plan" autoFocus lineNumbers className="min-h-[360px]" />
      <div className="flex gap-2">
        <button type="button" disabled={busy || draft === body || !draft.trim()} onClick={() => void save()} className={PRIMARY_BUTTON}>
          Save as new version
        </button>
        <button type="button" onClick={() => setDraft(null)} className={QUIET_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}
