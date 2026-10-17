import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BOARD_COLUMNS } from "../constants/columns";
import { TASK_BOARD_CHANGED } from "../constants/limits";
import type { ArtifactKind, ArtifactMeta, ArtifactRef, ArtifactSource } from "../types/artifact";
import type { Card, CardCreate, CardPatch } from "../types/card";
import type { BoardSettings } from "../types/settings";
import type { StageRun, StageRunCreate, StageRunPatch } from "../types/stage";

const RUN_STATES = ["idle", "queued", "running", "failed"];

/** Rust validates every write; this only catches a contract drift between the two sides. */
function asCard(value: Card): Card {
  const known =
    (BOARD_COLUMNS as readonly string[]).includes(value.columnId) &&
    RUN_STATES.includes(value.runState);
  if (!known) throw new Error(`Unexpected card state ${value.columnId}/${value.runState}`);
  return value;
}

export type ArtifactWrite = {
  cardId: string;
  kind: ArtifactKind;
  source: ArtifactSource;
  stageRunId?: string;
  body: string;
};

export const taskBoardClient = {
  listCards: async (project: string | null, archived: boolean): Promise<Card[]> =>
    (await invoke<Card[]>("task_board_cards_list", { project, archived })).map(asCard),
  getCard: async (id: string): Promise<Card | null> => {
    const card = await invoke<Card | null>("task_board_card_get", { id });
    return card && asCard(card);
  },
  createCard: async (card: CardCreate): Promise<Card> =>
    asCard(await invoke<Card>("task_board_card_create", { card })),
  updateCard: async (id: string, expectedUpdatedAt: number, patch: CardPatch): Promise<Card> =>
    asCard(await invoke<Card>("task_board_card_update", { id, expectedUpdatedAt, patch })),
  deleteCard: (id: string): Promise<void> => invoke("task_board_card_delete", { id }),
  claimNext: async (): Promise<Card | null> => {
    const card = await invoke<Card | null>("task_board_claim_next");
    return card && asCard(card);
  },
  listRuns: (cardId: string): Promise<StageRun[]> => invoke("task_board_runs_list", { cardId }),
  runningRuns: (): Promise<StageRun[]> => invoke("task_board_runs_running"),
  createRun: (run: StageRunCreate): Promise<StageRun> => invoke("task_board_run_create", { run }),
  updateRun: (id: string, patch: StageRunPatch): Promise<StageRun> =>
    invoke("task_board_run_update", { id, patch }),
  listArtifacts: (cardId: string): Promise<ArtifactMeta[]> =>
    invoke("task_board_artifacts_list", { cardId }),
  readArtifact: (cardId: string, kind: ArtifactKind, version: number): Promise<string> =>
    invoke("task_board_artifact_read", { cardId, kind, version }),
  writeArtifact: (input: ArtifactWrite): Promise<ArtifactMeta> =>
    invoke("task_board_artifact_write", { ...input, stageRunId: input.stageRunId ?? null }),
  /** Replaces the card worktree's `.molfar/board/` with these versions; returns their relative paths. */
  materializeInputs: (cardId: string, inputs: readonly ArtifactRef[]): Promise<string[]> =>
    invoke("task_board_inputs_materialize", { cardId, inputs }),
  getSettings: (): Promise<BoardSettings> => invoke("task_board_settings_get"),
  setSettings: (settings: BoardSettings): Promise<BoardSettings> =>
    invoke("task_board_settings_set", { settings }),
};

export type TaskBoardClient = typeof taskBoardClient;

export function onTaskBoardChanged(callback: () => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen(TASK_BOARD_CHANGED, callback).then((stop) => {
    if (disposed) stop();
    else unlisten = stop;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
