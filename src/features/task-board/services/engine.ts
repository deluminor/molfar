import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { isStalled } from "../model/attention";
import type { Card } from "../types/card";
import type { EnginePorts } from "./ports";
import { reconcile, reconcileDeliveries } from "./reconcile";
import { latestRun } from "./stage-fail";
import { settleStage } from "./stage-settle";
import { startStage } from "./stage-start";

/**
 * Drives queued cards through their agent stages. One instance per main
 * window. Ticks are serialized; a tick requested mid-tick runs right after.
 */
export class TaskBoardEngine {
  /** Card id → token of the launch this engine is driving for it. */
  private readonly live = new Map<string, number>();
  private readonly stallNotified = new Set<string>();
  private nextToken = 0;
  private booted = false;
  private ticking = false;
  private again = false;
  private stopped = false;

  constructor(private readonly ports: EnginePorts) {}

  stop(): void {
    this.stopped = true;
  }

  resume(): void {
    this.stopped = false;
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      this.again = true;
      return;
    }
    this.ticking = true;
    try {
      do {
        this.again = false;
        await this.cycle();
      } while (this.again && !this.stopped);
    } catch (error: unknown) {
      console.error("Task board engine tick failed", error);
    } finally {
      this.ticking = false;
    }
  }

  private async cycle(): Promise<void> {
    if (this.stopped) return;
    if (!this.booted) {
      this.booted = true;
      await reconcileDeliveries(this.ports);
    }
    await reconcile(this.ports, this.live);

    for (;;) {
      const card = await this.ports.store.claimNext();
      if (!card) break;
      this.launch(card);
    }

    await this.notifyStalls();
  }

  private launch(card: Card): void {
    const token = ++this.nextToken;
    this.live.set(card.id, token);
    const settled = (runId: string, cardId: string, outcome: ControlOutcome) =>
      void this.settle(runId, cardId, outcome, token);

    void startStage(this.ports, card, settled)
      .catch((error: unknown) => console.error("Task board stage start failed", { cardId: card.id, error }))
      .finally(() => void this.releaseIfIdle(card.id, token));
  }

  private release(cardId: string, token: number): void {
    if (this.live.get(cardId) === token) this.live.delete(cardId);
  }

  /** A start that ended without a running turn never settles; release it so reconcile can see the card. */
  private async releaseIfIdle(cardId: string, token: number): Promise<void> {
    const run = await latestRun(this.ports.store, cardId).catch(() => undefined);
    if (run?.status !== "running") this.release(cardId, token);
  }

  private async settle(runId: string, cardId: string, outcome: ControlOutcome, token: number): Promise<void> {
    try {
      await settleStage(this.ports, runId, cardId, outcome);
    } catch (error: unknown) {
      console.error("Task board stage settle failed", { runId, cardId, error });
    } finally {
      this.release(cardId, token);
      void this.tick();
    }
  }

  private async notifyStalls(): Promise<void> {
    const [settings, runs] = await Promise.all([
      this.ports.store.getSettings(),
      this.ports.store.runningRuns(),
    ]);
    const now = this.ports.now();

    for (const run of runs) {
      if (this.stallNotified.has(run.id) || !isStalled(run, now, settings.stallMinutes)) continue;
      this.stallNotified.add(run.id);
      const card = await this.ports.store.getCard(run.cardId);
      this.ports.notify.notify({
        cardId: run.cardId,
        projectCwd: card?.projectCwd ?? "",
        kind: "stalled",
        title: card ? `#${card.number} ${card.title}` : "Task Board",
        body: `The ${run.stage.replace("_", " ")} stage has run for ${settings.stallMinutes}+ minutes.`,
      });
    }
  }
}
