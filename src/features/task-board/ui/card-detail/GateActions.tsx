import { useState, type ReactNode } from "react";
import { confirmApp } from "../../../../app/model/appDialog";
import { Archive, GitMerge, GitPullRequest, GitBranch, Play, RotateCcw, Square, Trash2, Undo2, Check } from "../../../../shared/ui/icons";
import { isAgentStage } from "../../constants/columns";
import { transition } from "../../model/transitions";
import type { OwnerAction } from "../../services/actions";
import type { Card, DeliveryMethod } from "../../types/card";
import type { StageModelConfig } from "../../types/stage";
import { StageModelEditor } from "../board/StageModelEditor";
import { DANGER_BUTTON, OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from "../button-styles";

type Props = {
  card: Card;
  openDelivery: boolean;
  /** null while unknown; without GitHub only Keep branch is offered. */
  github: boolean | null;
  onAct: (action: OwnerAction) => Promise<void>;
};

const DELIVERY: { method: DeliveryMethod; label: string; icon: typeof GitPullRequest; hint: string }[] = [
  { method: "pr", label: "Open pull request", icon: GitPullRequest, hint: "Push the branch and open a PR." },
  { method: "merge", label: "Squash-merge", icon: GitMerge, hint: "Open a PR and squash-merge it right away." },
  { method: "keep", label: "Keep branch", icon: GitBranch, hint: "No push. Remove the worktree, keep the branch." },
];

/** The footer of the card drawer: only the actions the state machine allows. */
export function GateActions({ card, openDelivery, github, onAct }: Props): ReactNode {
  const [delivering, setDelivering] = useState(openDelivery);
  const [retrying, setRetrying] = useState(false);
  const [override, setOverride] = useState<StageModelConfig | undefined>(undefined);
  const allowed = (action: OwnerAction["type"]) => transition(card, action === "deliver" ? "deliverStart" : action).ok;
  const methods = github === false ? DELIVERY.filter((entry) => entry.method === "keep") : DELIVERY;
  const delivered = card.columnId === "done";

  const archive = async () => {
    const ok = await confirmApp(
      delivered
        ? "Archive this card? It leaves the board and stays available under Archived."
        : "Archive this card? Its worktree is deleted, and its branch too unless it was pushed.",
      {
        title: delivered ? "Archive card" : "Reject card",
        okLabel: delivered ? "Archive" : "Reject",
        kind: "warning",
      },
    );
    if (ok) await onAct({ type: "reject" });
  };

  const deliver = async (method: DeliveryMethod) => {
    if (method === "merge") {
      const ok = await confirmApp("Open a pull request and squash-merge it now?", { title: "Squash-merge", okLabel: "Merge" });
      if (!ok) return;
    }
    await onAct({ type: "deliver", method });
  };

  if (card.archived) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-stroke bg-content/[0.02] px-4 py-3">
      {retrying && isAgentStage(card.columnId) ? (
        <div className="flex flex-col gap-2 rounded-lg bg-content/[0.03] p-2.5">
          <span className="text-[12px] text-content/55">Run this stage with (saved on the card)</span>
          <StageModelEditor value={override} project={card.projectCwd} onChange={setOverride} />
        </div>
      ) : null}
      {delivering && allowed("deliver") ? (
        <div className="grid gap-1.5">
          {github === false ? (
            <p className="text-[11px] text-content/45">GitHub is not available for this repository, so only Keep branch is offered.</p>
          ) : null}
          {methods.map(({ method, label, icon: Icon, hint }) => (
            <button key={method} type="button" onClick={() => void deliver(method)} className={`${OUTLINE_BUTTON} h-auto justify-start py-2`}>
              <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="flex flex-col items-start">
                <span>{label}</span>
                <span className="text-[11px] font-normal text-content/45">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {allowed("start") ? (
          <button type="button" onClick={() => void onAct({ type: "start" })} className={PRIMARY_BUTTON}>
            <Play className="size-3.5" strokeWidth={2} /> Start grill
          </button>
        ) : null}
        {allowed("approvePlan") ? (
          <button type="button" onClick={() => void onAct({ type: "approvePlan" })} className={PRIMARY_BUTTON}>
            <Check className="size-3.5" strokeWidth={2} /> Approve plan
          </button>
        ) : null}
        {allowed("deliver") && !delivering ? (
          <button type="button" onClick={() => setDelivering(true)} className={PRIMARY_BUTTON}>
            <GitPullRequest className="size-3.5" strokeWidth={2} /> Deliver…
          </button>
        ) : null}
        {allowed("retry") ? (
          <button
            type="button"
            onClick={() => (retrying ? void onAct({ type: "retry", override }) : setRetrying(true))}
            className={PRIMARY_BUTTON}
          >
            <RotateCcw className="size-3.5" strokeWidth={2} /> {retrying ? "Retry now" : "Retry…"}
          </button>
        ) : null}
        {allowed("back") ? (
          <button type="button" onClick={() => void onAct({ type: "back" })} className={QUIET_BUTTON}>
            <Undo2 className="size-3.5" strokeWidth={1.75} /> Back
          </button>
        ) : null}
        {allowed("cancel") ? (
          <button type="button" onClick={() => void onAct({ type: "cancel" })} className={OUTLINE_BUTTON}>
            <Square className="size-3.5" strokeWidth={1.75} /> Cancel stage
          </button>
        ) : null}
        <div className="flex-1" />
        {allowed("reject") ? (
          <button type="button" onClick={() => void archive()} className={DANGER_BUTTON}>
            {delivered ? <Archive className="size-3.5" strokeWidth={1.75} /> : <Trash2 className="size-3.5" strokeWidth={1.75} />}
            {delivered ? "Archive" : "Reject"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
