import type { StageRun, StageStatus } from "../types/stage";
import { transitionCard } from "./card-transition";
import type { BoardStorePort, EnginePorts } from "./ports";

/** Rust refuses error texts above 20 000 characters; keep the head and the tail. */
const ERROR_MAX = 19_000;

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function boundedError(text: string): string {
  if (text.length <= ERROR_MAX) return text;
  const half = Math.floor(ERROR_MAX / 2);
  return `${text.slice(0, half)}\n…\n${text.slice(-half)}`;
}

/**
 * The card's newest run (runs are listed in insertion order). Older runs may
 * still settle late, but they must not move the card.
 */
export async function latestRun(store: BoardStorePort, cardId: string): Promise<StageRun | undefined> {
  const runs = await store.listRuns(cardId);
  return runs[runs.length - 1];
}

/**
 * Closes a stage run as failed, cancelled or interrupted and parks the card
 * with the error. The card only moves when this run is its newest one and it
 * is still running; otherwise only the run record is closed.
 */
export async function failStage(
  ports: EnginePorts,
  cardId: string,
  runId: string | null,
  status: Exclude<StageStatus, "running" | "succeeded">,
  error: string,
): Promise<void> {
  const message = boundedError(error);
  if (runId) {
    await ports.store
      .updateRun(runId, { status, error: message, dispatch: "settled" })
      .catch((reason: unknown) => console.error("Task board: could not close stage run", { runId, reason }));
  }

  const card = await ports.store.getCard(cardId);
  if (!card || card.runState !== "running") return;
  if (runId && (await latestRun(ports.store, cardId))?.id !== runId) return;

  const { card: failed } = await transitionCard(ports.store, cardId, "stageFailed", () => ({ lastError: message }));
  ports.notify.notify({
    cardId,
    projectCwd: failed.projectCwd,
    kind: "failed",
    title: `#${failed.number} ${failed.title}`,
    body: message,
  });
}
