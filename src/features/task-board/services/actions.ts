import { isAgentStage } from "../constants/columns";
import { transition } from "../model/transitions";
import { formatAnswers, parseQuestions } from "../model/artifacts/questions";
import { formatReworkBrief, parseReview } from "../model/artifacts/review";
import { formatTask } from "../model/artifacts/task";
import { parseOverrides } from "../model/stage-config";
import type { GrillAnswer } from "../types/artifact";
import type { Card, CardPatch, DeliveryMethod } from "../types/card";
import type { StageModelConfig } from "../types/stage";
import { readLatest } from "./artifact-reader";
import { IllegalTransitionError, transitionCard } from "./card-transition";
import { deliverCard, rejectCard } from "./delivery";
import type { EnginePorts } from "./ports";

export type OwnerAction =
  | { type: "start" }
  | { type: "answer"; answers: GrillAnswer[]; note: string }
  | { type: "requestChanges"; note: string }
  | { type: "approvePlan" }
  | { type: "editPlan"; body: string }
  | { type: "editTask"; title?: string; description?: string; acceptanceCriteria?: string; baseRef?: string | null }
  | { type: "rework"; findings: string[]; note: string }
  | { type: "deliver"; method: DeliveryMethod }
  | { type: "retry"; override?: Partial<StageModelConfig> }
  | { type: "back" }
  | { type: "cancel" }
  | { type: "reject" };

/** Questions asked by the newest successful grill round; older rounds' questions are settled. */
async function currentQuestions(ports: EnginePorts, card: Card) {
  const [metas, runs] = await Promise.all([ports.store.listArtifacts(card.id), ports.store.listRuns(card.id)]);
  const grill = runs.filter((run) => run.stage === "grill" && run.status === "succeeded").pop();
  const asked = metas.filter((meta) => meta.kind === "questions" && meta.stageRunId === grill?.id).pop();
  if (!asked) return [];
  return parseQuestions(await ports.store.readArtifact(card.id, "questions", asked.version));
}

async function writeAnswers(ports: EnginePorts, card: Card, answers: GrillAnswer[], note: string) {
  const questions = answers.length ? await currentQuestions(ports, card) : [];
  const body = formatAnswers(questions, answers, note);
  if (!body.trim()) throw new IllegalTransitionError("Answer at least one question or add a note.");
  await ports.store.writeArtifact({ cardId: card.id, kind: "answers", source: "user", body });
}

async function writeReworkBrief(ports: EnginePorts, card: Card, findings: string[], note: string) {
  const { review } = await readLatest(ports.store, card.id, ["review"]);
  const parsed = review ? parseReview(review.body) : undefined;
  const all = parsed?.ok ? parsed.review.findings : [];
  const body = formatReworkBrief(all, findings, note);
  if (!body.trim()) throw new IllegalTransitionError("Select at least one finding or add a note.");
  await ports.store.writeArtifact({ cardId: card.id, kind: "rework_brief", source: "user", body });
}

async function editTask(ports: EnginePorts, card: Card, action: Extract<OwnerAction, { type: "editTask" }>) {
  const patch: CardPatch = {};
  if (action.title !== undefined) patch.title = action.title.trim();
  if (action.description !== undefined) patch.description = action.description.trim();
  if (action.acceptanceCriteria !== undefined) patch.acceptanceCriteria = action.acceptanceCriteria.trim();
  if (action.baseRef !== undefined) {
    if (card.columnId !== "backlog")
      throw new IllegalTransitionError("The base branch is fixed once the card has started.");
    patch.baseRef = action.baseRef?.trim() || null;
  }

  const { card: edited } = await transitionCard(ports.store, card.id, "editTask", () => patch);
  await ports.store.writeArtifact({ cardId: card.id, kind: "task", source: "user", body: formatTask(edited) });
  return edited;
}

function retryOverrides(card: Card, override: Partial<StageModelConfig> | undefined): string | undefined {
  const stage = card.columnId;
  if (!override || !isAgentStage(stage)) return undefined;
  const overrides = parseOverrides(card.overridesJson);
  return JSON.stringify({ ...overrides, [stage]: { ...overrides[stage], ...override } });
}

async function cancel(ports: EnginePorts, card: Card): Promise<Card> {
  const { card: cancelled } = await transitionCard(ports.store, card.id, "cancel", () => ({
    lastError: "Cancelled.",
  }));
  if (card.runState !== "running") return cancelled;

  const run = (await ports.store.listRuns(card.id)).find((entry) => entry.status === "running");
  if (!run) return cancelled;
  // Before the turn is submitted nothing will settle the run; close it here so
  // the starting stage sees the cancel and never launches (or stops at once).
  if (run.dispatch !== "turn_submitted")
    await ports.store.updateRun(run.id, { status: "cancelled", error: "Cancelled.", dispatch: "settled" });
  if (run.sessionId) await ports.sessions.stop(run.sessionId);
  return cancelled;
}

/**
 * Every user decision on a card, from the desktop or a paired phone. Writes
 * the decision's artifact first, then moves the card through the state
 * machine; callers tick the engine afterwards to pick up queued stages.
 */
export async function runAction(ports: EnginePorts, cardId: string, action: OwnerAction): Promise<Card> {
  const card = await ports.store.getCard(cardId);
  if (!card) throw new Error("Card not found.");
  // Check before writing the action's artifact, so a refused action leaves no orphan file behind.
  const probe = action.type === "deliver" ? "deliverStart" : action.type;
  const legal = transition(card, probe);
  if (!legal.ok) throw new IllegalTransitionError(legal.reason);

  switch (action.type) {
    case "answer":
      await writeAnswers(ports, card, action.answers, action.note);
      return (await transitionCard(ports.store, cardId, "answer")).card;
    case "requestChanges":
      await writeAnswers(ports, card, [], action.note);
      return (await transitionCard(ports.store, cardId, "requestChanges")).card;
    case "editPlan": {
      const { card: kept } = await transitionCard(ports.store, cardId, "editPlan");
      await ports.store.writeArtifact({ cardId, kind: "plan", source: "user", body: action.body });
      return kept;
    }
    case "editTask":
      return editTask(ports, card, action);
    case "rework":
      await writeReworkBrief(ports, card, action.findings, action.note);
      return (await transitionCard(ports.store, cardId, "rework")).card;
    case "deliver":
      return deliverCard(ports, cardId, action.method);
    case "reject":
      return rejectCard(ports, cardId);
    case "cancel":
      return cancel(ports, card);
    case "retry": {
      const overridesJson = retryOverrides(card, action.override);
      return (await transitionCard(ports.store, cardId, "retry", () => (overridesJson ? { overridesJson } : {}))).card;
    }
    case "start":
    case "approvePlan":
    case "back":
      return (await transitionCard(ports.store, cardId, action.type)).card;
  }
}
