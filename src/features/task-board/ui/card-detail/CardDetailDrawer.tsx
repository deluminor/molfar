import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconButton } from "../../../../app/shell/TitleBar";
import { FoldingTab } from "../../../../shared/ui/FoldingTab";
import { X } from "../../../../shared/ui/icons";
import { useCardDetail, type CardDetail } from "../../hooks/use-card-detail";
import { useGithubAvailable } from "../../hooks/use-github-available";
import type { TaskBoardRuntime } from "../../hooks/use-task-board-engine";
import type { DropTarget } from "../../model/transitions";
import type { OwnerAction } from "../../services/actions";
import type { Card } from "../../types/card";
import { MoveToMenu } from "../board/MoveToMenu";
import { CardMeta } from "./CardMeta";
import type { DetailIntent } from "./detail-intent";
import { initialTab, visibleTabs, type DetailTab } from "./detail-tabs";
import { DetailPanelFrame } from "./DetailPanelFrame";
import { DetailTabBody } from "./DetailTabBody";
import { GateActions } from "./GateActions";

type Props = {
  runtime: TaskBoardRuntime;
  cardId: string;
  intent: DetailIntent;
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
  onMove: (card: Card, target: DropTarget) => void;
};

type ContentProps = Omit<Props, "cardId"> & { card: Card; detail: CardDetail };

function CardDetailContent({ runtime, card, detail, intent, onClose, onOpenSession, onMove }: ContentProps): ReactNode {
  const [tab, setTab] = useState<DetailTab>(() => initialTab(intent));
  const [actionError, setActionError] = useState<string | null>(null);
  const github = useGithubAvailable(runtime.ports.git, card.columnId === "final_review" ? card.worktreePath : null);
  const tabs = visibleTabs(detail.artifacts, card.columnId === "plan_approval" && card.runState === "idle");

  const act = useCallback(
    async (action: OwnerAction) => {
      setActionError(null);
      try {
        await runtime.act(card.id, action);
      } catch (reason: unknown) {
        setActionError(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [runtime, card.id],
  );

  return (
    <div className="task-board-panel-body flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-stroke pl-4 pr-2" data-tauri-drag-region="deep">
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-content/45">#{card.number}</span>
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-content">{card.title}</h2>
        <MoveToMenu card={card} onMove={onMove} />
        <IconButton label="Close card" onClick={onClose}>
          <X className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </header>

      <CardMeta card={card} runs={detail.runs} />

      <div role="tablist" aria-label="Card sections" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-stroke px-3 pb-2">
        {tabs.map(({ id, label, icon }) => (
          <FoldingTab
            key={id}
            label={label}
            icon={icon}
            selected={tab === id}
            role="tab"
            aria-selected={tab === id}
            aria-label={label}
            onClick={() => setTab(id)}
          />
        ))}
      </div>

      <div role="tabpanel" aria-label={tabs.find((entry) => entry.id === tab)?.label} className="flex min-h-0 flex-1 flex-col">
        <DetailTabBody
          key={tab}
          tab={tab}
          runtime={runtime}
          card={card}
          detail={detail}
          intent={intent}
          onAct={act}
          onOpenSession={onOpenSession}
        />
      </div>

      {actionError ? (
        <p role="alert" className="shrink-0 border-t border-rose-400/20 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
          {actionError}
        </p>
      ) : null}
      <GateActions card={card} openDelivery={intent === "deliver"} github={github} onAct={act} />
    </div>
  );
}

/** The selected card beside the board; Escape closes it. */
export function CardDetailDrawer({ runtime, cardId, ...rest }: Props): ReactNode {
  const detail = useCardDetail(runtime.ports.store, cardId);
  const { onClose } = rest;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const card = detail.card;
  return (
    <DetailPanelFrame label={card ? `Card #${card.number}` : "Card"}>
      {card ? (
        <CardDetailContent key={`${card.id}:${rest.intent ?? ""}`} runtime={runtime} card={card} detail={detail} {...rest} />
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-content/40">{detail.error ?? "Loading…"}</div>
      )}
    </DetailPanelFrame>
  );
}
