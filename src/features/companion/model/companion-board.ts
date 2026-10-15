import { parsePrPatch } from "../../source-control/model/prDiff";
import type { TaskBoardRuntime } from "../../task-board/hooks/use-task-board-engine";
import { latestVersions } from "../../task-board/services/artifact-reader";
import { isStalled, needsYou } from "../../task-board/model/attention";
import { legalDropTargets } from "../../task-board/model/transitions";
import type { Card } from "../../task-board/types/card";
import type { StageRun } from "../../task-board/types/stage";
import { BoardInputError, cardId, column, ownerAction, text, updatedAt } from "./companion-board-input";

const PATCH_MAX = 60_000;

export type BoardCardSummary = {
  id: string;
  number: number;
  title: string;
  project: string;
  column: Card["columnId"];
  runState: Card["runState"];
  needsYou: boolean;
  stalled: boolean;
  grillRound: number;
  reworkCycle: number;
  branch?: string;
  updatedAt: number;
};

/** Read models and actions behind the Companion's `board.*` RPCs. */
export function createCompanionBoard(runtime: TaskBoardRuntime, now: () => number = Date.now) {
  const { store, git } = runtime.ports;

  const context = async () => {
    const [runs, settings] = await Promise.all([store.runningRuns(), store.getSettings()]);
    return { running: new Map(runs.map((run) => [run.cardId, run])), stallMinutes: settings.stallMinutes };
  };

  const summary = (card: Card, run: StageRun | undefined, stallMinutes: number): BoardCardSummary => ({
    id: card.id,
    number: card.number,
    title: card.title,
    project: card.projectCwd,
    column: card.columnId,
    runState: card.runState,
    needsYou: needsYou(card, Boolean(run?.sessionId && runtime.needsInput(run.sessionId))),
    stalled: Boolean(run && isStalled(run, now(), stallMinutes)),
    grillRound: card.grillRound,
    reworkCycle: card.reworkCycle,
    ...(card.branch ? { branch: card.branch } : {}),
    updatedAt: card.updatedAt,
  });

  const load = async (id: string): Promise<Card> => {
    const card = await store.getCard(id);
    if (!card) throw new BoardInputError("not_found", "card not found");
    return card;
  };

  const fresh = async (input: Record<string, unknown>): Promise<Card> => {
    const card = await load(cardId(input));
    if (card.updatedAt !== updatedAt(input)) throw new BoardInputError("conflict", "the card changed; reload it");
    return card;
  };

  const summarize = async (card: Card) => {
    const { running, stallMinutes } = await context();
    return summary(card, running.get(card.id), stallMinutes);
  };

  const diff = async (card: Card, input: Record<string, unknown>) => {
    if (!card.worktreePath || !card.baseSha) return undefined;
    const files = parsePrPatch((await git.rangeDiff(card.worktreePath, card.baseSha)).diffPatch);
    const wanted = input.diffFile === undefined ? "" : text(input, "diffFile", 4096);
    const file = files.find((entry) => entry.path === wanted);
    const cap = typeof input.maxPatchChars === "number" ? Math.min(Math.max(input.maxPatchChars, 1_000), PATCH_MAX) : PATCH_MAX;
    return {
      files: files.map(({ path, additions, deletions }) => ({ path, added: additions, removed: deletions })),
      ...(file ? { patch: file.lines.map((line) => line.text).join("\n").slice(0, cap) } : {}),
    };
  };

  const detail = async (card: Card, input: Record<string, unknown>) => {
    const [base, runs, metas] = await Promise.all([summarize(card), store.listRuns(card.id), store.listArtifacts(card.id)]);
    const latest = latestVersions(metas);
    const artifacts = await Promise.all(
      metas.map(async (meta) => ({
        kind: meta.kind,
        version: meta.version,
        source: meta.source,
        createdAt: meta.createdAt,
        ...(latest.get(meta.kind) === meta.version ? { body: await store.readArtifact(card.id, meta.kind, meta.version) } : {}),
      })),
    );
    return {
      ...base,
      description: card.description,
      acceptanceCriteria: card.acceptanceCriteria,
      ...(card.baseRef ? { baseRef: card.baseRef } : {}),
      ...(card.lastError ? { lastError: card.lastError } : {}),
      legalMoves: card.archived ? [] : legalDropTargets(card).map((target) => target.column),
      artifacts,
      runs: runs.map((run) => ({
        id: run.id,
        stage: run.stage,
        attempt: run.attempt,
        harness: run.harness,
        model: run.model,
        status: run.status,
        ...(run.sessionId ? { sessionId: run.sessionId } : {}),
        startedAt: run.startedAt,
        ...(run.completedAt ? { completedAt: run.completedAt } : {}),
      })),
      diff: await diff(card, input),
    };
  };

  async function handle(action: string, input: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "board.list": {
        const project = input.project === undefined ? null : text(input, "project", 4096);
        const [cards, { running, stallMinutes }] = await Promise.all([store.listCards(project, input.archived === true), context()]);
        return { cards: cards.map((card) => summary(card, running.get(card.id), stallMinutes)) };
      }
      case "board.card":
        return detail(await load(cardId(input)), input);
      case "board.artifact": {
        const card = await load(cardId(input));
        const kind = text(input, "kind", 32);
        const version = typeof input.version === "number" ? input.version : 0;
        const known = (await store.listArtifacts(card.id)).find((meta) => meta.kind === kind && meta.version === version);
        if (!known) throw new BoardInputError("not_found", "artifact not found");
        return { kind, version, body: await store.readArtifact(card.id, known.kind, version) };
      }
      case "board.create": {
        const created = await runtime.create({
          projectCwd: text(input, "project", 4096),
          title: text(input, "title", 200),
          description: text(input, "description", 100_000),
          acceptanceCriteria: text(input, "acceptanceCriteria", 50_000, true),
          baseRef: text(input, "baseRef", 255, true) || null,
        });
        return summarize(created);
      }
      case "board.move": {
        const card = await fresh(input);
        const target = legalDropTargets(card).find((entry) => entry.column === column(input.to));
        if (!target) throw new BoardInputError("illegal_transition", "the card cannot move there");
        if (target.needsInput || (target.action !== "start" && target.action !== "approvePlan" && target.action !== "back"))
          throw new BoardInputError("needs_input", `use board.action "${target.action}" with its input`);
        return summarize(await runtime.act(card.id, { type: target.action }));
      }
      case "board.action": {
        const card = await fresh(input);
        return summarize(await runtime.act(card.id, ownerAction(input)));
      }
      default:
        throw new BoardInputError("invalid_input", `unknown action ${action}`);
    }
  }

  /** The session of one of the card's stage runs; nothing else is reachable this way. */
  async function stageSession(input: Record<string, unknown>): Promise<string> {
    const card = await load(cardId(input));
    const runId = cardId(input, "runId");
    const run = (await store.listRuns(card.id)).find((entry) => entry.id === runId);
    if (!run?.sessionId) throw new BoardInputError("not_found", "stage session not found");
    return run.sessionId;
  }

  async function attention(): Promise<number> {
    const [cards, { running, stallMinutes }] = await Promise.all([store.listCards(null, false), context()]);
    return cards.filter((card) => summary(card, running.get(card.id), stallMinutes).needsYou).length;
  }

  return { handle, stageSession, attention };
}

export type CompanionBoard = ReturnType<typeof createCompanionBoard>;
