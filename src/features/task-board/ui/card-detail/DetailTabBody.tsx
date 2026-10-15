import type { ReactNode } from "react";
import { versionsOf, type CardDetail } from "../../hooks/use-card-detail";
import type { TaskBoardRuntime } from "../../hooks/use-task-board-engine";
import { transition } from "../../model/transitions";
import type { OwnerAction } from "../../services/actions";
import type { Card } from "../../types/card";
import { ArtifactTab } from "./ArtifactTab";
import { CardDiff } from "./CardDiff";
import { CardOverview } from "./CardOverview";
import type { DetailIntent } from "./detail-intent";
import { DETAIL_TABS, type DetailTab } from "./detail-tabs";
import { PlanEditor } from "./PlanEditor";
import { QuestionsForm } from "./QuestionsForm";
import { ReviewChecklist } from "./ReviewChecklist";

type Props = {
  tab: DetailTab;
  runtime: TaskBoardRuntime;
  card: Card;
  detail: CardDetail;
  intent: DetailIntent;
  onAct: (action: OwnerAction) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
};

/** A form that owns the rest of the panel and scrolls inside it. */
function Scroll({ children }: { children: ReactNode }): ReactNode {
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>;
}

/** One tab of the card panel. Every branch fills the panel and scrolls on its own. */
export function DetailTabBody({ tab, runtime, card, detail, intent, onAct, onOpenSession }: Props): ReactNode {
  if (tab === "overview")
    return <CardOverview card={card} runs={detail.runs} now={Date.now()} onAct={onAct} onOpenSession={onOpenSession} />;
  if (tab === "diff") return <CardDiff git={runtime.ports.git} worktree={card.worktreePath} baseSha={card.baseSha} />;

  const entry = DETAIL_TABS.find((candidate) => candidate.id === tab);
  const kind = entry?.kind ?? "task";
  const versions = versionsOf(detail.artifacts, kind);
  const atPlanGate = card.columnId === "plan_approval" && card.runState === "idle";
  const canRework = transition(card, "rework").ok;

  const render = (body: string, version: number): ReactNode => {
    const latest = version === 0 || version === versions[0];
    if (kind === "plan")
      return <PlanEditor key={version} body={body} editable={atPlanGate && latest} onSave={(next) => onAct({ type: "editPlan", body: next })} />;
    if (kind === "questions")
      return (
        <Scroll>
          <QuestionsForm
            key={version}
            markdown={body}
            editable={atPlanGate && latest}
            focusNote={intent === "requestChanges"}
            onAnswer={(answers, note) => onAct({ type: "answer", answers, note })}
            onRequestChanges={(note) => onAct({ type: "requestChanges", note })}
          />
        </Scroll>
      );
    return (
      <Scroll>
        <ReviewChecklist
          key={version}
          markdown={body}
          canRework={canRework && latest}
          onRework={(findings, note) => onAct({ type: "rework", findings, note })}
        />
      </Scroll>
    );
  };
  if (kind === "questions" && versions.length === 0)
    return atPlanGate ? render("", 0) : <p className="px-4 py-6 text-[13px] text-content/40">Grill asked no questions.</p>;
  const custom = kind === "plan" || kind === "questions" || kind === "review";

  return (
    <ArtifactTab store={runtime.ports.store} cardId={card.id} kind={kind} versions={versions} label={entry?.label ?? ""}>
      {custom ? render : undefined}
    </ArtifactTab>
  );
}
