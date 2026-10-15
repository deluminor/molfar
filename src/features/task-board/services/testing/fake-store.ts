import type { ArtifactWrite } from "../../api/task-board-client";
import { CONFLICT_PREFIX } from "../../constants/limits";
import type { ArtifactMeta } from "../../types/artifact";
import type { Card, CardCreate, CardPatch } from "../../types/card";
import type { BoardSettings } from "../../types/settings";
import type { StageRun, StageRunCreate, StageRunPatch } from "../../types/stage";
import type { BoardStorePort } from "../ports";

/** In-memory twin of the Rust `task_board` module, with the same CAS and claim rules. */
export function createFakeStore(clock: () => number) {
  const cards = new Map<string, Card>();
  const runs = new Map<string, StageRun>();
  const artifacts: (ArtifactMeta & { body: string })[] = [];
  let settings: BoardSettings = { columns: {}, maxConcurrentStages: 3, stallMinutes: 45 };
  let ids = 0;

  const copy = <T>(value: T): T => structuredClone(value);
  const bump = (card: Card) => Math.max(clock(), card.updatedAt + 1);

  const store: BoardStorePort = {
    async listCards(project, archived) {
      return [...cards.values()]
        .filter((card) => card.archived === archived && (!project || card.projectCwd === project))
        .map(copy);
    },
    async getCard(id) {
      const card = cards.get(id);
      return card ? copy(card) : null;
    },
    async createCard(input: CardCreate) {
      const now = clock();
      const card: Card = {
        ...input,
        number: cards.size + 1,
        columnId: "backlog",
        runState: "idle",
        position: cards.size + 1,
        baseSha: null,
        branch: null,
        worktreePath: null,
        grillRound: 0,
        reworkCycle: 0,
        overridesJson: "{}",
        lastError: null,
        deliveryJson: null,
        archived: false,
        queuedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      cards.set(card.id, card);
      return copy(card);
    },
    async updateCard(id, expected, patch: CardPatch) {
      const card = cards.get(id);
      if (!card) throw new Error("Card not found.");
      if (card.updatedAt !== expected) throw new Error(`${CONFLICT_PREFIX} the card changed`);
      const wasQueued = card.runState === "queued";
      const next: Card = { ...card, ...patch, updatedAt: bump(card) };
      if (next.runState !== "queued") next.queuedAt = null;
      else if (!wasQueued) next.queuedAt = clock();
      cards.set(id, next);
      return copy(next);
    },
    async deleteCard(id) {
      cards.delete(id);
    },
    async claimNext() {
      const live = [...cards.values()].filter((card) => !card.archived);
      if (live.filter((card) => card.runState === "running").length >= settings.maxConcurrentStages)
        return null;
      const next = live
        .filter((card) => card.runState === "queued")
        .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0) || a.number - b.number)[0];
      if (!next) return null;
      const claimed: Card = { ...next, runState: "running", queuedAt: null, updatedAt: bump(next) };
      cards.set(claimed.id, claimed);
      return copy(claimed);
    },
    async listRuns(cardId) {
      return [...runs.values()].filter((run) => run.cardId === cardId).map(copy);
    },
    async runningRuns() {
      return [...runs.values()].filter((run) => run.status === "running").map(copy);
    },
    async createRun(input: StageRunCreate) {
      const attempt =
        [...runs.values()].filter((run) => run.cardId === input.cardId && run.stage === input.stage).length + 1;
      const run: StageRun = {
        ...input,
        attempt,
        sessionId: null,
        dispatch: "accepted",
        status: "running",
        error: null,
        headBefore: null,
        porcelainBefore: null,
        fingerprintBefore: null,
        headAfter: null,
        startedAt: clock(),
        completedAt: null,
      };
      runs.set(run.id, run);
      return copy(run);
    },
    async updateRun(id, patch: StageRunPatch) {
      const run = runs.get(id);
      if (!run) throw new Error("Stage run not found.");
      if (run.status !== "running") throw new Error("This stage run has already finished.");
      const next: StageRun = { ...run, ...patch };
      if (patch.status && patch.status !== "running") next.completedAt = clock();
      runs.set(id, next);
      return copy(next);
    },
    async listArtifacts(cardId) {
      return artifacts.filter((entry) => entry.cardId === cardId).map(({ body: _body, ...meta }) => meta);
    },
    async readArtifact(cardId, kind, version) {
      const found = artifacts.find((entry) => entry.cardId === cardId && entry.kind === kind && entry.version === version);
      if (!found) throw new Error("Artifact not found.");
      return found.body;
    },
    async writeArtifact(input: ArtifactWrite) {
      const version =
        artifacts.filter((entry) => entry.cardId === input.cardId && entry.kind === input.kind).length + 1;
      const meta: ArtifactMeta = {
        id: `artifact-${++ids}`,
        cardId: input.cardId,
        kind: input.kind,
        version,
        source: input.source,
        stageRunId: input.stageRunId ?? null,
        createdAt: clock(),
      };
      artifacts.push({ ...meta, body: input.body });
      return meta;
    },
    async getSettings() {
      return copy(settings);
    },
    async setSettings(next) {
      settings = copy(next);
      return copy(settings);
    },
  };

  const latest = (cardId: string, kind: ArtifactMeta["kind"]) =>
    artifacts.filter((entry) => entry.cardId === cardId && entry.kind === kind).pop();

  return { store, cards, runs, artifacts, latest };
}
