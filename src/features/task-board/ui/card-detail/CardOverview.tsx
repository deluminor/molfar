import { useState, type ReactNode } from "react";
import { projectName } from "../../../../shared/lib/paths";
import { parseDelivery } from "../../model/delivery-text";
import { transition } from "../../model/transitions";
import type { OwnerAction } from "../../services/actions";
import type { Card } from "../../types/card";
import type { StageRun } from "../../types/stage";
import { FIELD, FIELD_LABEL, OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from "../button-styles";
import { CardTimeline } from "./CardTimeline";

type Props = {
  card: Card;
  runs: readonly StageRun[];
  now: number;
  onAct: (action: OwnerAction) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
};

function Fact({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex gap-3 text-[12px]">
      <dt className="w-20 shrink-0 text-content/40">{label}</dt>
      <dd className="min-w-0 break-words text-content/80">{children}</dd>
    </div>
  );
}

function TaskEditor({ card, onAct, onDone }: { card: Card; onAct: Props["onAct"]; onDone: () => void }): ReactNode {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [criteria, setCriteria] = useState(card.acceptanceCriteria);
  const [baseRef, setBaseRef] = useState(card.baseRef ?? "");
  const baseEditable = card.columnId === "backlog";

  const save = async () => {
    await onAct({
      type: "editTask",
      title,
      description,
      acceptanceCriteria: criteria,
      ...(baseEditable ? { baseRef: baseRef || null } : {}),
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <label className={FIELD_LABEL}>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD} />
      </label>
      <label className={FIELD_LABEL}>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className={`${FIELD} resize-y leading-5`} />
      </label>
      <label className={FIELD_LABEL}>
        Acceptance criteria
        <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={3} className={`${FIELD} resize-y leading-5`} />
      </label>
      {baseEditable ? (
        <label className={FIELD_LABEL}>
          Base branch
          <input value={baseRef} onChange={(event) => setBaseRef(event.target.value.trim())} placeholder="default branch" className={`${FIELD} font-mono`} />
        </label>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={!title.trim() || !description.trim()} onClick={() => void save()} className={PRIMARY_BUTTON}>
          Save task
        </button>
        <button type="button" onClick={onDone} className={QUIET_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CardOverview({ card, runs, now, onAct, onOpenSession }: Props): ReactNode {
  const [editing, setEditing] = useState(false);
  const editable = transition(card, "editTask").ok;
  const delivery = parseDelivery(card.deliveryJson);

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {card.lastError ? (
        <div role="alert" className="whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] leading-5 text-rose-300">
          {card.lastError}
        </div>
      ) : null}

      {editing ? (
        <TaskEditor card={card} onAct={onAct} onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="flex flex-col gap-1.5">
            <Fact label="Project">{projectName(card.projectCwd)}</Fact>
            <Fact label="Base">{card.baseRef ?? "default branch"}</Fact>
            {card.branch ? <Fact label="Branch"><span className="font-mono">{card.branch}</span></Fact> : null}
            <Fact label="Rounds">
              grill {card.grillRound} · rework {card.reworkCycle}
            </Fact>
            {delivery?.prUrl ? (
              <Fact label="Pull request">
                <a href={delivery.prUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {delivery.prUrl}
                </a>
              </Fact>
            ) : null}
          </dl>
          <p className="whitespace-pre-wrap text-[13px] leading-5 text-content/75">{card.description}</p>
          {editable ? (
            <button type="button" onClick={() => setEditing(true)} className={`${OUTLINE_BUTTON} self-start`}>
              Edit task
            </button>
          ) : null}
        </>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-content/40">Stages</h3>
        <CardTimeline runs={runs} now={now} onOpenSession={onOpenSession} />
      </section>
    </div>
  );
}
