import { isAgentStage } from "../constants/columns";
import { transitionCard } from "./card-transition";
import { isDelivering } from "./delivery";
import type { EnginePorts } from "./ports";
import { failStage } from "./stage-fail";
import { settleStage } from "./stage-settle";

const INTERRUPTED = "MOLFAR stopped before the stage finished. Retry to run it again.";
const NEVER_STARTED = "The stage was interrupted before it started. Retry to run it again.";
const DELIVERY_INTERRUPTED = "Delivery was interrupted. Deliver again to finish it; finished steps are skipped.";

/**
 * Classifies running work the engine has no live callback for: after a
 * restart, or when a settlement callback was lost. `live` holds card ids the
 * engine is driving right now; they are left alone.
 */
export async function reconcile(ports: EnginePorts, live: { has(cardId: string): boolean }): Promise<void> {
  const [runs, cards] = await Promise.all([ports.store.runningRuns(), ports.store.listCards(null, false)]);

  for (const run of runs) {
    if (live.has(run.cardId)) continue;
    const state = run.sessionId ? ports.sessions.state(run.sessionId) : "missing";
    if (state === "busy") continue;

    const submitted = state === "idle" && run.dispatch === "turn_submitted";
    if (submitted) await settleStage(ports, run.id, run.cardId, { status: "completed", text: "" });
    else await failStage(ports, run.cardId, run.id, "interrupted", INTERRUPTED);
  }

  const withRun = new Set(runs.map((run) => run.cardId));
  for (const card of cards) {
    const orphan = card.runState === "running" && isAgentStage(card.columnId);
    if (!orphan || live.has(card.id) || withRun.has(card.id)) continue;
    await failStage(ports, card.id, null, "interrupted", NEVER_STARTED);
  }
}

/** On start only: a delivery that was running when MOLFAR quit can be resumed by delivering again. */
export async function reconcileDeliveries(ports: EnginePorts): Promise<void> {
  const cards = await ports.store.listCards(null, false);
  for (const card of cards) {
    const stuck = card.columnId === "final_review" && card.runState === "running" && !isDelivering(card.id);
    if (!stuck) continue;
    await transitionCard(ports.store, card.id, "deliveryFailed", () => ({ lastError: DELIVERY_INTERRUPTED }));
  }
}
