import { useCallback, useEffect, useMemo, useState } from "react";
import { onTaskBoardChanged } from "../api/task-board-client";
import type { BoardColumn, Card } from "../types/card";
import type { BoardSettings } from "../types/settings";
import type { StageRun } from "../types/stage";
import type { TaskBoardRuntime } from "./use-task-board-engine";

export type BoardData = {
  cards: Card[];
  byColumn: Map<BoardColumn, Card[]>;
  /** The running stage run of each busy card. */
  running: Map<string, StageRun>;
  settings: BoardSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** Live board contents for one project filter, refreshed on every board change. */
export function useTaskBoard(runtime: TaskBoardRuntime, project: string | null, archived: boolean): BoardData {
  const { store } = runtime.ports;
  const [cards, setCards] = useState<Card[]>([]);
  const [running, setRunning] = useState(new Map<string, StageRun>());
  const [settings, setSettings] = useState<BoardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => onTaskBoardChanged(reload), [reload]);

  useEffect(() => {
    let alive = true;
    Promise.all([store.listCards(project, archived), store.runningRuns(), store.getSettings()])
      .then(([nextCards, runs, nextSettings]) => {
        if (!alive) return;
        setCards(nextCards);
        setRunning(new Map(runs.map((run) => [run.cardId, run])));
        setSettings(nextSettings);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (alive) setError(String(reason));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [store, project, archived, version]);

  const byColumn = useMemo(() => {
    const grouped = new Map<BoardColumn, Card[]>();
    for (const card of cards) {
      const list = grouped.get(card.columnId) ?? [];
      list.push(card);
      grouped.set(card.columnId, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.position - b.position);
    return grouped;
  }, [cards]);

  return { cards, byColumn, running, settings, loading, error, reload };
}
