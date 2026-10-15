import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X } from "../../../../shared/ui/icons";
import { COLUMN_LABEL } from "../../constants/columns";
import { useCardDetail, versionsOf } from "../../hooks/use-card-detail";
import type { TaskBoardRuntime } from "../../hooks/use-task-board-engine";
import { transition, type DropTarget } from "../../model/transitions";
import type { Card } from "../../types/card";
import { MoveToMenu } from "../board/MoveToMenu";
import type { OwnerAction } from "../../services/actions";
import type { GitPort } from "../../services/ports";
import type { ArtifactKind } from "../../types/artifact";
import { ArtifactTab } from "./ArtifactTab";
import { CardDiff } from "./CardDiff";
import { CardOverview } from "./CardOverview";
import type { DetailIntent } from "./detail-intent";
import { GateActions } from "./GateActions";
import { PlanEditor } from "./PlanEditor";
import { QuestionsForm } from "./QuestionsForm";
import { ReviewChecklist } from "./ReviewChecklist";

type Tab = "overview" | "task" | "spec" | "plan" | "questions" | "impl_report" | "review" | "diff";

const TABS: { id: Tab; label: string; kind?: ArtifactKind }[] = [
  { id: "overview", label: "Overview" },
  { id: "task", label: "Task", kind: "task" },
  { id: "spec", label: "Spec", kind: "spec" },
  { id: "plan", label: "Plan", kind: "plan" },
  { id: "questions", label: "Questions", kind: "questions" },
  { id: "impl_report", label: "Report", kind: "impl_report" },
  { id: "review", label: "Review", kind: "review" },
  { id: "diff", label: "Diff" },
];

function initialTab(intent: DetailIntent): Tab {
  if (intent === "rework") return "review";
  if (intent === "requestChanges") return "questions";
  return "overview";
}

/** Whether delivery can open pull requests for this worktree; null while checking. */
function useGithubAvailable(git: GitPort, worktree: string | null): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!worktree) return;
    let alive = true;
    git
      .githubRepo(worktree)
      .then(() => alive && setAvailable(true))
      .catch((error: unknown) => {
        console.error("Task board: GitHub repository lookup failed", { worktree, error });
        if (alive) setAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [git, worktree]);
  return available;
}

type Props = {
  runtime: TaskBoardRuntime;
  cardId: string;
  intent: DetailIntent;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  onMove: (card: Card, target: DropTarget) => void;
};

export function CardDetailDrawer({ runtime, cardId, intent, onClose, onOpenSession, onMove }: Props): ReactNode {
  const { card, runs, artifacts, error } = useCardDetail(runtime.ports.store, cardId);
  const [tab, setTab] = useState<Tab>(() => initialTab(intent));
  const [actionError, setActionError] = useState<string | null>(null);
  const github = useGithubAvailable(runtime.ports.git, card?.columnId === "final_review" ? card.worktreePath : null);
  const now = Date.now();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const act = useCallback(
    async (action: OwnerAction) => {
      setActionError(null);
      try {
        await runtime.act(cardId, action);
      } catch (reason: unknown) {
        setActionError(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [runtime, cardId],
  );

  if (!card)
    return (
      <aside className="flex w-[520px] shrink-0 items-center justify-center border-l border-stroke text-[13px] text-content/40">
        {error ?? "Loading…"}
      </aside>
    );

  const atPlanGate = card.columnId === "plan_approval" && card.runState === "idle";
  const canRework = transition(card, "rework").ok;
  const tabs = TABS.filter((entry) => !entry.kind || entry.kind === "task" || versionsOf(artifacts, entry.kind).length > 0 || entry.id === "diff");

  const body = (): ReactNode => {
    if (tab === "overview") return <CardOverview card={card} runs={runs} now={now} onAct={act} onOpenSession={onOpenSession} />;
    if (tab === "diff") return <CardDiff git={runtime.ports.git} worktree={card.worktreePath} baseSha={card.baseSha} />;

    const kind = TABS.find((entry) => entry.id === tab)?.kind ?? "task";
    const label = TABS.find((entry) => entry.id === tab)?.label ?? "";
    const versions = versionsOf(artifacts, kind);
    const render = (bodyText: string, version: number): ReactNode => {
      const latest = version === versions[0];
      if (kind === "plan") return <PlanEditor key={version} body={bodyText} editable={atPlanGate && latest} onSave={(next) => act({ type: "editPlan", body: next })} />;
      if (kind === "questions")
        return (
          <QuestionsForm
            key={version}
            markdown={bodyText}
            editable={atPlanGate && latest}
            focusNote={intent === "requestChanges"}
            onAnswer={(answers, note) => act({ type: "answer", answers, note })}
            onRequestChanges={(note) => act({ type: "requestChanges", note })}
          />
        );
      if (kind === "review")
        return <ReviewChecklist key={version} markdown={bodyText} canRework={canRework && latest} onRework={(findings, note) => act({ type: "rework", findings, note })} />;
      return undefined;
    };
    const custom = kind === "plan" || kind === "questions" || kind === "review";
    return <ArtifactTab key={kind} store={runtime.ports.store} cardId={card.id} kind={kind} versions={versions} label={label}>{custom ? render : undefined}</ArtifactTab>;
  };

  return (
    <aside aria-label={`Card #${card.number}`} className="flex w-[520px] max-w-[60vw] shrink-0 flex-col border-l border-stroke bg-content/[0.015]">
      <header className="flex shrink-0 items-start gap-2 px-4 pb-2 pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] text-content/45">
            <span className="font-mono tabular-nums">#{card.number}</span> · {COLUMN_LABEL[card.columnId]}
            {card.archived ? " · archived" : ""}
          </span>
          <h2 className="text-[15px] font-medium leading-snug text-content">{card.title}</h2>
        </div>
        <MoveToMenu card={card} onMove={onMove} />
        <button type="button" onClick={onClose} aria-label="Close card" className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-content/50 hover:bg-content/[0.08] hover:text-content">
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </header>

      <nav role="tablist" aria-label="Card sections" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-stroke px-3">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`-mb-px shrink-0 cursor-pointer border-b-2 px-2 py-1.5 text-[12px] transition-colors duration-150 motion-reduce:transition-none ${tab === entry.id ? "border-accent text-content" : "border-transparent text-content/50 hover:text-content/80"}`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {body()}
      </div>

      {actionError ? (
        <p role="alert" className="shrink-0 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
          {actionError}
        </p>
      ) : null}
      <GateActions card={card} openDelivery={intent === "deliver"} github={github} onAct={act} />
    </aside>
  );
}
