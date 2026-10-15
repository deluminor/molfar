import { parseReview } from "../model/artifacts/review";
import { dirtyCheckoutError } from "../model/checkout-checks";
import { parseDelivery, pullRequestBody, pullRequestNumber, pullRequestTitle } from "../model/delivery-text";
import type { Card, Delivery, DeliveryMethod } from "../types/card";
import { readLatest } from "./artifact-reader";
import { transitionCard } from "./card-transition";
import { writeCard } from "./card-writer";
import type { EnginePorts } from "./ports";
import { boundedError, errorText } from "./stage-fail";
import { cleanupWorktree } from "./worktree";

/** Cards whose delivery runs in this window; reconcile leaves them alone. */
const delivering = new Set<string>();

export function isDelivering(cardId: string): boolean {
  return delivering.has(cardId);
}

async function remember(ports: EnginePorts, cardId: string, record: Delivery): Promise<void> {
  await writeCard(ports.store, cardId, () => ({ deliveryJson: JSON.stringify(record) }));
}

/**
 * Pushes, opens and optionally merges the pull request. Each finished step is
 * stored on the card first, so delivering again after a failure resumes
 * instead of opening a second PR or merging twice.
 */
async function publish(ports: EnginePorts, card: Card, method: DeliveryMethod): Promise<Delivery> {
  const record: Delivery = { method, deliveredAt: 0 };
  if (method === "keep") return record;

  const cwd = card.worktreePath ?? "";
  const repo = await ports.git.githubRepo(cwd).catch((error: unknown) => {
    throw new Error(`Only Keep branch is available: GitHub is not reachable for this repository (${errorText(error)}).`);
  });
  const previous = parseDelivery(card.deliveryJson);
  await ports.git.push(cwd);

  record.prUrl = previous?.prUrl;
  if (!record.prUrl) {
    const docs = await readLatest(ports.store, card.id, ["spec", "impl_report", "review"]);
    const review = docs.review ? parseReview(docs.review.body) : undefined;
    record.prUrl = await ports.git.createPullRequest(cwd, {
      title: pullRequestTitle(card, docs.spec?.body),
      body: pullRequestBody(card, docs.impl_report?.body, review?.ok ? review.review : undefined),
      base: card.baseRef ?? (await ports.git.defaultBranch(card.projectCwd)),
      head: card.branch ?? "",
    });
    await remember(ports, card.id, record);
  }
  if (method === "pr" || previous?.merged) return { ...record, merged: previous?.merged };

  const number = pullRequestNumber(record.prUrl);
  if (!number) throw new Error(`Opened ${record.prUrl}, but could not read its number to merge it.`);
  await ports.git.squashMerge(cwd, repo, number);
  record.merged = true;
  await remember(ports, card.id, record);
  return record;
}

async function deliverLocked(ports: EnginePorts, card: Card, method: DeliveryMethod): Promise<Card> {
  try {
    if (!card.worktreePath) throw new Error("The card has no worktree to deliver.");
    const dirty = dirtyCheckoutError(await ports.git.snapshot(card.worktreePath));
    if (dirty) throw new Error(dirty);

    const delivery: Delivery = { ...(await publish(ports, card, method)), deliveredAt: ports.now() };
    await ports.store.writeArtifact({ cardId: card.id, kind: "delivery", source: "engine", body: JSON.stringify(delivery, null, 2) });

    let warning: string | null = null;
    await cleanupWorktree(ports, card, { force: false, dropUnpushedBranch: false }).catch((error: unknown) => {
      console.error("Task board: worktree cleanup after delivery failed", { cardId: card.id, error });
      warning = `Delivered, but the worktree could not be removed: ${errorText(error)}`;
    });
    const { card: done } = await transitionCard(ports.store, card.id, "deliver", () => ({
      deliveryJson: JSON.stringify(delivery),
      worktreePath: warning ? card.worktreePath : null,
      lastError: warning ? boundedError(warning) : null,
    }));
    return done;
  } catch (error: unknown) {
    const { card: failed } = await transitionCard(ports.store, card.id, "deliveryFailed", () => ({
      lastError: boundedError(errorText(error)),
    }));
    return failed;
  }
}

/**
 * Delivers a reviewed card. The card is locked in `running` first, so only one
 * delivery runs; it reaches Done only after publishing succeeds.
 */
export async function deliverCard(ports: EnginePorts, cardId: string, method: DeliveryMethod): Promise<Card> {
  const { card } = await transitionCard(ports.store, cardId, "deliverStart");
  delivering.add(cardId);
  try {
    return await deliverLocked(ports, card, method);
  } finally {
    delivering.delete(cardId);
  }
}

/**
 * Archives a card first (so the engine can no longer claim it), then discards
 * its worktree and any branch that was never pushed.
 */
export async function rejectCard(ports: EnginePorts, cardId: string): Promise<Card> {
  const before = await ports.store.getCard(cardId);
  if (!before) throw new Error("Card not found.");
  const { card: archived } = await transitionCard(ports.store, cardId, "reject", () => ({ worktreePath: null }));

  try {
    await cleanupWorktree(ports, before, { force: true, dropUnpushedBranch: true });
    return archived;
  } catch (error: unknown) {
    console.error("Task board: cleanup after reject failed", { cardId, error });
    const noted = await writeCard(ports.store, cardId, () => ({
      worktreePath: before.worktreePath,
      lastError: boundedError(`Archived, but the worktree could not be removed: ${errorText(error)}`),
    }));
    return noted ?? archived;
  }
}
