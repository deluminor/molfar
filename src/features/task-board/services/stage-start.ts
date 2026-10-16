import type { ControlOutcome } from "../../orchestration/model/orchestration";
import { COLUMN_LABEL, isAgentStage, READ_ONLY_STAGES } from "../constants/columns";
import { PROMPT_WARN_CHARS } from "../constants/limits";
import { dirtyCheckoutError } from "../model/checkout-checks";
import { stageInputs } from "../model/prompts/inputs";
import { TEMPLATE_VERSION } from "../model/prompts/shared";
import { buildStagePrompt } from "../model/prompts/stages";
import { resolveStageConfig } from "../model/stage-config";
import type { Card } from "../types/card";
import type { AgentStage } from "../types/stage";
import { latestRefs } from "./artifact-reader";
import type { EnginePorts } from "./ports";
import { errorText, failStage, latestRun } from "./stage-fail";
import { ensureWorktree } from "./worktree";

export type StageSettled = (runId: string, cardId: string, outcome: ControlOutcome) => void;

/**
 * Copies the stage's inputs into the worktree's git-ignored `.molfar/board/`
 * and names them in the prompt; artifact bodies never ride in the prompt.
 */
async function preparePrompt(ports: EnginePorts, card: Card, stage: AgentStage, headSha: string) {
  const contract = stageInputs(stage, card.grillRound);
  const refs = await latestRefs(ports.store, card.id, [...contract.required, ...contract.optional]);
  const missing = contract.required.filter((kind) => !refs.some((ref) => ref.kind === kind));
  if (missing.length) throw new Error(`Missing input artifacts: ${missing.join(", ")}.`);

  const paths = await ports.store.materializeInputs(card.id, refs);
  const files = refs.map((ref, index) => ({ ...ref, path: paths[index] }));
  const prompt = buildStagePrompt(stage, { card, files, headSha });
  if (prompt.length > PROMPT_WARN_CHARS) {
    console.warn("Task board: stage prompt is unusually long", { cardId: card.id, stage, chars: prompt.length });
  }
  return prompt;
}

/** The card still runs this very run; a cancel or retry in the meantime says no. */
async function stillCurrent(ports: EnginePorts, cardId: string, runId: string): Promise<boolean> {
  const [card, run] = await Promise.all([ports.store.getCard(cardId), latestRun(ports.store, cardId)]);
  return card?.runState === "running" && run?.id === runId && run.status === "running";
}

/**
 * Runs one claimed card's stage up to the submitted turn. Each step is
 * recorded as it completes, so a crash leaves a run that reconcile can
 * classify. Completion arrives later through `settled`.
 */
export async function startStage(
  ports: EnginePorts,
  claimed: Card,
  settled: StageSettled,
): Promise<void> {
  const stage = claimed.columnId;
  if (!isAgentStage(stage)) {
    await failStage(ports, claimed.id, null, "failed", `No agent runs in ${stage}.`);
    return;
  }

  let runId: string | null = null;
  try {
    const settings = await ports.store.getSettings();
    const choice = resolveStageConfig(stage, claimed.projectCwd, settings, claimed.overridesJson);
    const run = await ports.store.createRun({
      id: ports.newId(),
      cardId: claimed.id,
      stage,
      harness: choice.harness,
      model: choice.model,
      settingsJson: JSON.stringify(choice.modelSettings),
      runtimeMode: choice.runtimeMode,
      templateVersion: TEMPLATE_VERSION,
    });
    runId = run.id;

    const card = await ensureWorktree(ports, claimed);
    const cwd = card.worktreePath ?? "";
    const before = await ports.git.snapshot(cwd);
    const dirty = READ_ONLY_STAGES.includes(stage) ? null : dirtyCheckoutError(before);
    if (dirty) throw new Error(dirty);

    const prompt = await preparePrompt(ports, card, stage, before.head);
    const sessionId = ports.newId();
    await ports.store.updateRun(run.id, {
      headBefore: before.head,
      porcelainBefore: before.porcelain,
      fingerprintBefore: before.fingerprint,
      sessionId,
      dispatch: "session_prepared",
    });
    if (!(await stillCurrent(ports, card.id, run.id))) return;

    await ports.sessions.launch(
      { sessionId, cardId: card.id, stage, cwd, projectCwd: card.projectCwd, title: `#${card.number} · ${COLUMN_LABEL[stage]} · ${card.title}`, choice },
      prompt,
      (outcome) => settled(run.id, card.id, outcome),
    );
    await ports.store.updateRun(run.id, { dispatch: "turn_submitted" }).catch((error: unknown) => {
      // A fast turn may settle first; its run is then final.
      console.error("Task board: could not record the submitted turn", { runId: run.id, error });
    });
    // Cancelled while the session was starting: the cancel found nothing to stop yet.
    if (!(await stillCurrent(ports, card.id, run.id))) await ports.sessions.stop(sessionId);
  } catch (error: unknown) {
    await failStage(ports, claimed.id, runId, "failed", errorText(error));
  }
}
