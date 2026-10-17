import { useState, type ReactNode } from "react";
import { projectName } from "../../../../shared/lib/paths";
import { AlertCircle, ExternalLink, PenLine } from "../../../../shared/ui/icons";
import { AgentMarkdown } from "../../../sessions/ui/AgentMarkdown";
import { parseDelivery } from "../../model/delivery-text";
import { transition } from "../../model/transitions";
import type { OwnerAction } from "../../services/actions";
import type { Card } from "../../types/card";
import type { StageRun } from "../../types/stage";
import { FIELD, FIELD_LABEL, PRIMARY_BUTTON, QUIET_BUTTON } from "../button-styles";
import { CardTimeline } from "./CardTimeline";
import { FadeFold } from "./FadeFold";

type Props = {
  card: Card;
  runs: readonly StageRun[];
  now: number;
  onAct: (action: OwnerAction) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
};

function Fact({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <>
      <dt className="text-[12px] text-content/40">{label}</dt>
      <dd className="min-w-0 break-words text-[12px] text-content/80">{children}</dd>
    </>
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

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-content/40">{title}</h3>
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function CardOverview({ card, runs, now, onAct, onOpenSession }: Props): ReactNode {
  const [editing, setEditing] = useState(false);
  const editable = transition(card, "editTask").ok;
  const delivery = parseDelivery(card.deliveryJson);
  const editButton = editable && !editing ? (
    <button type="button" onClick={() => setEditing(true)} className={`${QUIET_BUTTON} h-6 px-2`}>
      <PenLine className="size-3" strokeWidth={1.75} />
      Edit
    </button>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
      {card.lastError ? (
        <div role="alert" className="flex gap-2 whitespace-pre-wrap rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] leading-5 text-rose-200">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-rose-300" strokeWidth={2} />
          <span className="min-w-0">{card.lastError}</span>
        </div>
      ) : null}

      <Section title="Task" action={editButton}>
        {editing ? (
          <TaskEditor card={card} onAct={onAct} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-stroke bg-content/[0.03] p-3.5">
            <FadeFold label="the task description">
              <div className="board-markdown text-[13px] leading-5 text-content/85">
                <AgentMarkdown text={card.description} hardBreaks />
              </div>
            </FadeFold>
            {card.acceptanceCriteria ? (
              <div className="flex flex-col gap-1 border-t border-stroke pt-3">
                <span className="text-[11px] font-medium text-content/45">Acceptance criteria</span>
                <FadeFold label="the acceptance criteria">
                  <div className="board-markdown text-[12.5px] leading-5 text-content/70">
                    <AgentMarkdown text={card.acceptanceCriteria} hardBreaks />
                  </div>
                </FadeFold>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section title="Details">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
          <Fact label="Project">{projectName(card.projectCwd)}</Fact>
          <Fact label="Base">{card.baseRef ?? "default branch"}</Fact>
          {card.baseSha ? (
            <Fact label="Base commit">
              <span className="font-mono">{card.baseSha.slice(0, 10)}</span>
            </Fact>
          ) : null}
          <Fact label="Rounds">
            grill {card.grillRound} · rework {card.reworkCycle}
          </Fact>
          {delivery?.prUrl ? (
            <Fact label="Pull request">
              <a href={delivery.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                {delivery.prUrl.replace(/^https:\/\/github\.com\//, "")}
                <ExternalLink className="size-3" strokeWidth={1.75} />
              </a>
            </Fact>
          ) : null}
        </dl>
      </Section>

      <Section title="Stages">
        <CardTimeline runs={runs} now={now} onOpenSession={onOpenSession} />
      </Section>
    </div>
  );
}
