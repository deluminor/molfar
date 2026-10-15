import { useMemo, useState, type ReactNode } from "react";
import { MarkdownDocumentPreview } from "../../../sessions/ui/MarkdownDocumentPreview";
import { defaultSelected, parseReview } from "../../model/artifacts/review";
import type { FindingSeverity } from "../../types/artifact";
import { FIELD, PRIMARY_BUTTON } from "../button-styles";

const SEVERITY_TONE: Record<FindingSeverity, string> = {
  blocking: "bg-rose-400/12 text-rose-300",
  major: "bg-amber-300/10 text-amber-300",
  minor: "bg-content/[0.06] text-content/60",
  nit: "bg-content/[0.04] text-content/45",
};

type Props = {
  markdown: string;
  /** Rework is offered only at the Final review gate on the latest review. */
  canRework: boolean;
  onRework: (findings: string[], note: string) => Promise<void>;
};

export function ReviewChecklist({ markdown, canRework, onRework }: Props): ReactNode {
  const parsed = useMemo(() => parseReview(markdown), [markdown]);
  const findings = parsed.ok ? parsed.review.findings : [];
  const [selected, setSelected] = useState(() => new Set(defaultSelected(findings)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!parsed.ok) return <MarkdownDocumentPreview text={markdown} metadataLabel="Properties" />;

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    try {
      await onRework([...selected], note);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-medium text-content">
        Verdict: <span className={parsed.review.verdict === "APPROVE" ? "text-emerald-300" : "text-amber-300"}>{parsed.review.verdict}</span>
      </p>
      {findings.length === 0 ? <p className="text-[12px] text-content/45">No findings.</p> : null}
      {findings.map((finding) => (
        <label key={finding.id} className="flex cursor-pointer gap-2.5 rounded-lg bg-content/[0.03] p-2.5">
          <input
            type="checkbox"
            disabled={!canRework}
            checked={selected.has(finding.id)}
            onChange={() => toggle(finding.id)}
            className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="font-mono text-content/45">{finding.id}</span>
              <span className={`rounded px-1.5 text-[11px] font-medium ${SEVERITY_TONE[finding.severity]}`}>{finding.severity}</span>
              <span className="font-medium text-content">{finding.title}</span>
            </span>
            {finding.file ? <span className="truncate font-mono text-[11px] text-content/45">{finding.file}</span> : null}
            {finding.body ? <span className="whitespace-pre-wrap text-[12px] leading-5 text-content/65">{finding.body}</span> : null}
          </span>
        </label>
      ))}
      {canRework ? (
        <>
          <textarea
            aria-label="Note for rework"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Anything else the rework should do (optional)"
            className={`${FIELD} resize-y leading-5`}
          />
          <button
            type="button"
            disabled={busy || (selected.size === 0 && !note.trim())}
            onClick={() => void submit()}
            className={`${PRIMARY_BUTTON} self-start`}
          >
            Rework {selected.size} finding{selected.size === 1 ? "" : "s"}
          </button>
        </>
      ) : null}
    </div>
  );
}
