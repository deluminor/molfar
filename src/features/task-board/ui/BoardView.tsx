import { HARNESSES, type HarnessId } from "@/domain/harness/harness";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Kanban } from "@/shared/ui/icons";
import { SurfaceHeader } from "@/features/home/ui/SurfaceHeader";
import { BOARD_COLUMNS, isAgentStage } from "../constants/columns";
import { useBoardDrag, type BoardDrag } from "../hooks/use-board-drag";
import { DROP_LABEL } from "../constants/column-look";
import { needsYou } from "../model/attention";
import "./task-board.css";
import { useTaskBoard } from "../hooks/use-task-board";
import type { TaskBoardRuntime } from "../hooks/use-task-board-engine";
import { boardFocus, requestBoardFocus, subscribeBoardFocus } from "../model/board-focus";
import { cardStatus } from "../model/card-status";
import type { DropTarget } from "../model/transitions";
import type { BoardColumn as BoardColumnId, Card } from "../types/card";
import type { AgentStage, StageModelConfig } from "../types/stage";
import { BoardColumn } from "./board/BoardColumn";
import { BoardCard } from "./board/BoardCard";
import { DragGhost } from "./board/DragGhost";
import { BoardSettingsDialog } from "./BoardSettingsDialog";
import { BoardToolbar } from "./BoardToolbar";
import { CardDetailDrawer } from "./card-detail/CardDetailDrawer";
import { detailIntent, type DetailIntent } from "./card-detail/detail-intent";
import { NewCardDialog } from "./NewCardDialog";

const CLOCK_MS = 30_000;

function knownHarness(value: string | undefined): HarnessId | undefined {
  return HARNESSES.find((harness) => harness === value);
}

/** null while nothing is dragged; the drop's label where it may land; false elsewhere. */
function dropState(drag: BoardDrag, column: BoardColumnId): string | false | null {
  if (!drag.draggingId) return null;
  const target = drag.targets.get(column);
  return target ? (DROP_LABEL[target.action] ?? "Drop here") : false;
}

type Props = {
  runtime: TaskBoardRuntime;
  projects: readonly string[];
  besideRail: boolean;
  compactRail: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onOpenSession: (sessionId: string) => void;
};

/** The global Task Board surface opened from the project rail. */
export function BoardView({ runtime, projects, besideRail, compactRail, onClose, onToggleSidebar, onOpenSession }: Props): ReactNode {
  const [project, setProject] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [intent, setIntent] = useState<DetailIntent>(null);
  const [intentSeq, setIntentSeq] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const selectedId = useSyncExternalStore(subscribeBoardFocus, boardFocus, boardFocus);
  const board = useTaskBoard(runtime, project, archived);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const open = useCallback((cardId: string | null, next: DetailIntent = null) => {
    setIntent(next);
    if (next) setIntentSeq((seq) => seq + 1);
    requestBoardFocus(cardId);
  }, []);

  const onDrop = useCallback(
    (card: Card, target: DropTarget) => {
      if (target.needsInput) {
        open(card.id, detailIntent(target.action));
        return;
      }
      setActionError(null);
      if (target.action === "start" || target.action === "approvePlan" || target.action === "back")
        void runtime.act(card.id, { type: target.action }).catch((error: unknown) => setActionError(String(error)));
    },
    [runtime, open],
  );
  const drag = useBoardDrag(board.cards, onDrop);
  const draggedCard = drag.draggingId ? board.cards.find((card) => card.id === drag.draggingId) : undefined;

  const saveColumn = useCallback(
    (stage: AgentStage, config: StageModelConfig | undefined) => {
      if (!board.settings) return;
      const columns = { ...board.settings.columns };
      if (config) columns[stage] = config;
      else delete columns[stage];
      void runtime.ports.store.setSettings({ ...board.settings, columns }).catch((error: unknown) => setActionError(String(error)));
    },
    [board.settings, runtime],
  );

  const saveColumnSkills = useCallback(
    (stage: AgentStage, skills: string[] | undefined) => {
      if (!board.settings) return;
      const columnSkills = { ...(board.settings.columnSkills ?? {}) };
      if (skills !== undefined) columnSkills[stage] = skills;
      else delete columnSkills[stage];
      void runtime.ports.store
        .setSettings({ ...board.settings, columnSkills })
        .catch((error: unknown) => setActionError(String(error)));
    },
    [board.settings, runtime],
  );

  const inputPending = (card: Card) => {
    const run = board.running.get(card.id);
    return Boolean(run?.sessionId && runtime.needsInput(run.sessionId));
  };
  const running = board.cards.filter((card) => card.runState === "running").length;
  const waiting = board.cards.filter((card) => needsYou(card, inputPending(card))).length;
  const modelProject = project ?? projects[0];

  const renderCard = (card: Card) => {
    const run = board.running.get(card.id);
    const status = cardStatus(card, run, { now, stallMinutes: board.settings?.stallMinutes ?? 45, needsInput: inputPending(card) });
    return (
      <BoardCard
        key={card.id}
        card={card}
        status={status}
        harness={knownHarness(run?.harness)}
        selected={card.id === selectedId}
        draggable={!archived}
        dragging={drag.draggingId === card.id}
        onOpen={open}
        onDragStart={drag.start}
      />
    );
  };

  const error = actionError ?? board.error;

  return (
    <div role="region" aria-label="Task Board" className="flex min-h-0 min-w-0 flex-1 flex-col text-content">
      <SurfaceHeader
        title="Board"
        icon={Kanban}
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
      />
      <BoardToolbar
        projects={projects}
        project={project}
        archived={archived}
        running={running}
        waiting={waiting}
        onProject={setProject}
        onArchived={setArchived}
        onSettings={() => setEditingSettings(true)}
        onNew={() => setCreating(true)}
      />
      {error ? (
        <div role="alert" className="mx-4 mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div data-board-scroller className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto px-4 pb-4" aria-busy={board.loading}>
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column}
              column={column}
              cards={board.byColumn.get(column) ?? []}
              drop={dropState(drag, column)}
              over={drag.overColumn === column}
              modelConfig={isAgentStage(column) ? board.settings?.columns[column] : undefined}
              columnSkills={isAgentStage(column) ? board.settings?.columnSkills?.[column] : undefined}
              modelProject={modelProject}
              onModelChange={(config) => {
                if (isAgentStage(column)) saveColumn(column, config);
              }}
              onSkillsChange={(skills) => {
                if (isAgentStage(column)) saveColumnSkills(column, skills);
              }}
              renderCard={renderCard}
            />
          ))}
        </div>
        {selectedId ? (
          <CardDetailDrawer
            runtime={runtime}
            cardId={selectedId}
            intent={intent}
            intentSeq={intentSeq}
            onClose={() => open(null)}
            onOpenSession={onOpenSession}
            onMove={onDrop}
          />
        ) : null}
      </div>

      {draggedCard && drag.origin ? <DragGhost card={draggedCard} origin={drag.origin} ghostRef={drag.ghostRef} /> : null}
      {creating ? (
        <NewCardDialog
          projects={projects}
          initialProject={project}
          onCreate={async (input) => {
            const card = await runtime.create(input);
            open(card.id);
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editingSettings && board.settings ? (
        <BoardSettingsDialog
          settings={board.settings}
          onSave={(settings) => runtime.ports.store.setSettings(settings).then(() => undefined)}
          onClose={() => setEditingSettings(false)}
        />
      ) : null}
    </div>
  );
}
