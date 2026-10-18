import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { listSkills } from "@/platform/tauri/fs";
import { loadDisabledSkillPaths } from "@/features/skills/model/skills";
import { COLUMN_LABEL, isAgentStage, READ_ONLY_STAGES } from "../constants/columns";
import { PROMPT_WARN_CHARS } from "../constants/limits";
import { dirtyCheckoutError } from "../model/checkout-checks";
import { resolveGrillInputs, stageInputs } from "../model/prompts/inputs";
import { TEMPLATE_VERSION } from "../model/prompts/shared";
import { buildStagePrompt } from "../model/prompts/stages";
import { resolveStageSkills } from "../model/resolve-stage-skills";
import { resolveStageConfig } from "../model/stage-config";
import type { Card } from "../types/card";
import type { AgentStage } from "../types/stage";
import { latestRefs, readLatest } from "./artifact-reader";
import type { EnginePorts } from "./ports";
import { errorText, failStage, latestRun } from "./stage-fail";
import { ensureWorktree } from "./worktree";

export type StageSettled = (runId: string, cardId: string, outcome: ControlOutcome) => void;

async function availableSkillNames(cwd: string): Promise<Set<string>> {
  try {
    const discovered = await listSkills(cwd, loadDisabledSkillPaths());
    return new Set(discovered.map((skill) => skill.name));
  } catch {
    // No catalog (tests, headless, or IO failure): run the stage without skills.
    return new Set();
  }
}

/**
 * Copies the stage's inputs into the worktree's git-ignored `.molfar/board/`
 * and names them in the prompt; artifact bodies never ride in the prompt.
 */
async function preparePrompt(
  ports: EnginePorts,
  card: Card,
  stage: AgentStage,
  headSha: string,
  skillNames: readonly string[],
) {
  const requested = stageInputs(stage, card.grillRound);
  const loaded = await readLatest(ports.store, card.id, [...requested.required, ...requested.optional]);
  const contract = stage === "grill" ? resolveGrillInputs(card.grillRound, loaded) : requested;
  const missing = contract.required.filter((kind) => !loaded[kind]);
  if (missing.length) throw new Error(`Missing input artifacts: ${missing.join(", ")}.`);

  // Fallback to first-grill wording when later-round artifacts are absent.
  const promptCard =
    stage === "grill" && contract.required.length === 1 && card.grillRound > 1
      ? { ...card, grillRound: 1 }
      : card;

  const refs = await latestRefs(ports.store, card.id, [...contract.required, ...contract.optional]);
  const paths = await ports.store.materializeInputs(card.id, refs);
  const files = refs.map((ref, index) => ({ ...ref, path: paths[index] }));
  const prompt = buildStagePrompt(stage, { card: promptCard, files, headSha }, skillNames);
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

    const available = await availableSkillNames(card.projectCwd);
    const configured = settings.columnSkills?.[stage];
    const { skills: skillNames, missing: missingSkills } = resolveStageSkills(stage, configured, available);
    if (missingSkills.length) {
      console.warn("Task board: configured skills missing from catalog", {
        cardId: card.id,
        stage,
        missingSkills,
      });
    }

    const prompt = await preparePrompt(ports, card, stage, before.head, skillNames);
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
