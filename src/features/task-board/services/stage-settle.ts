import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { MANUAL_GATES, READ_ONLY_STAGES } from "../constants/columns";
import { readStageOutput } from "../model/artifacts/stage-outputs";
import { commitViolation, readOnlyViolation } from "../model/checkout-checks";
import type { StageRun } from "../types/stage";
import { transitionCard } from "./card-transition";
import type { EnginePorts } from "./ports";
import { errorText, failStage, latestRun } from "./stage-fail";

async function checkoutViolation(
  ports: EnginePorts,
  run: StageRun,
  worktree: string,
): Promise<{ error: string | null; head: string }> {
  const after = await ports.git.snapshot(worktree);
  if (run.headBefore === null || run.porcelainBefore === null || run.fingerprintBefore === null)
    return { error: "The stage has no starting snapshot to compare against.", head: after.head };

  const before = { head: run.headBefore, porcelain: run.porcelainBefore, fingerprint: run.fingerprintBefore };
  const error = READ_ONLY_STAGES.includes(run.stage)
    ? readOnlyViolation(before, after)
    : commitViolation(run.headBefore, after);
  return { error, head: after.head };
}

/**
 * Accepts a finished turn only when its artifacts parse and the checkout is in
 * the state the stage promised; then advances the card. Anything else parks
 * the card as failed with the reason.
 */
export async function settleStage(
  ports: EnginePorts,
  runId: string,
  cardId: string,
  outcome: ControlOutcome,
): Promise<void> {
  const run = (await ports.store.listRuns(cardId)).find((entry) => entry.id === runId);
  if (!run || run.status !== "running") return;

  const [card, latest] = await Promise.all([ports.store.getCard(cardId), latestRun(ports.store, cardId)]);
  const owned =
    card && !card.archived && card.columnId === run.stage && card.runState === "running" && latest?.id === runId;
  if (!owned || !card) {
    await failStage(ports, cardId, runId, "cancelled", "The card moved on before the stage finished.");
    return;
  }
  if (outcome.status !== "completed") {
    const status = outcome.status === "cancelled" ? "cancelled" : "failed";
    await failStage(ports, cardId, runId, status, outcome.error ?? `The stage ${outcome.status}.`);
    return;
  }

  try {
    const text = outcome.text || (run.sessionId ? ports.sessions.turnText(run.sessionId) : "");
    const output = readStageOutput(run.stage, text);
    if (!output.ok) throw new Error(output.error);
    const checkout = await checkoutViolation(ports, run, card.worktreePath ?? "");
    if (checkout.error) throw new Error(checkout.error);

    await Promise.all(
      output.artifacts.map(({ kind, body }) =>
        ports.store.writeArtifact({ cardId, kind, source: "stage", stageRunId: runId, body }),
      ),
    );
    await ports.store.updateRun(runId, {
      status: "succeeded",
      dispatch: "settled",
      headAfter: checkout.head,
    });
    const { card: next } = await transitionCard(ports.store, cardId, "stageSucceeded");

    if (MANUAL_GATES.includes(next.columnId))
      ports.notify.notify({
        cardId,
        projectCwd: next.projectCwd,
        kind: "gate",
        title: `#${next.number} ${next.title}`,
        body: next.columnId === "plan_approval" ? "Plan ready for approval." : "Ready for final review.",
      });
  } catch (error: unknown) {
    await failStage(ports, cardId, runId, "failed", errorText(error));
  }
}
