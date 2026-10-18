import { useState, type ReactNode } from "react";
import { PenLine } from "@/shared/ui/icons";
import { MarkdownDocumentPreview } from "@/features/sessions/ui/MarkdownDocumentPreview";
import { MarkdownSourceEditor } from "@/features/sessions/ui/MarkdownSourceEditor";
import { OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from "../button-styles";

type Props = {
  body: string;
  editable: boolean;
  onSave: (body: string) => Promise<void>;
};

/** The plan, editable at Plan approval; a save becomes a new plan version. Fills the panel. */
export function PlanEditor({ body, editable, onSave }: Props): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: string) => {
    setBusy(true);
    try {
      await onSave(next);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  if (draft === null)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {editable ? (
          <div className="flex shrink-0 justify-end px-4 pt-3">
            <button type="button" onClick={() => setDraft(body)} className={OUTLINE_BUTTON}>
              <PenLine className="size-3.5" strokeWidth={1.75} />
              Edit plan
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <MarkdownDocumentPreview text={body} metadataLabel="Properties" />
        </div>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-stroke">
        <MarkdownSourceEditor value={draft} onChange={setDraft} label="Plan" autoFocus lineNumbers className="min-h-full" />
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={busy || draft === body || !draft.trim()} onClick={() => void save(draft)} className={PRIMARY_BUTTON}>
          Save as new version
        </button>
        <button type="button" onClick={() => setDraft(null)} className={QUIET_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}
