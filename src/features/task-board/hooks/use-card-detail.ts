import { useCallback, useEffect, useState } from "react";
import { onTaskBoardChanged } from "../api/task-board-client";
import type { ArtifactKind, ArtifactMeta } from "../types/artifact";
import type { Card } from "../types/card";
import type { StageRun } from "../types/stage";
import type { BoardStorePort } from "../services/ports";

export type CardDetail = {
  card: Card | null;
  runs: StageRun[];
  artifacts: ArtifactMeta[];
  loading: boolean;
  error: string | null;
};

/** Versions available per kind, newest first. */
export function versionsOf(artifacts: readonly ArtifactMeta[], kind: ArtifactKind): number[] {
  return artifacts
    .filter((artifact) => artifact.kind === kind)
    .map((artifact) => artifact.version)
    .sort((a, b) => b - a);
}

export function useCardDetail(store: BoardStorePort, cardId: string): CardDetail {
  const [detail, setDetail] = useState<CardDetail>({
    card: null,
    runs: [],
    artifacts: [],
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => onTaskBoardChanged(reload), [reload]);

  useEffect(() => {
    let alive = true;
    Promise.all([store.getCard(cardId), store.listRuns(cardId), store.listArtifacts(cardId)])
      .then(([card, runs, artifacts]) => {
        if (alive) setDetail({ card, runs, artifacts, loading: false, error: null });
      })
      .catch((reason: unknown) => {
        if (alive) setDetail((previous) => ({ ...previous, loading: false, error: String(reason) }));
      });
    return () => {
      alive = false;
    };
  }, [store, cardId, version]);

  return detail;
}

/** One artifact body, loaded on demand and cached per version. */
export function useArtifactBody(
  store: BoardStorePort,
  cardId: string,
  kind: ArtifactKind,
  version: number | undefined,
): { body: string | null; error: string | null } {
  const [state, setState] = useState<{ body: string | null; error: string | null }>({ body: null, error: null });

  useEffect(() => {
    if (!version) {
      setState({ body: null, error: null });
      return;
    }
    let alive = true;
    store
      .readArtifact(cardId, kind, version)
      .then((body) => alive && setState({ body, error: null }))
      .catch((reason: unknown) => alive && setState({ body: null, error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [store, cardId, kind, version]);

  return state;
}
