import { pathKey } from "@/shared/lib/paths";
import { REMOTE_PATH_PREFIX } from "@/shared/lib/remote-paths";
import { formatTask } from "../model/artifacts/task";
import type { Card } from "../types/card";
import type { EnginePorts } from "./ports";
import { errorText } from "./stage-fail";

export type NewCard = {
  /**
   * A caller-chosen id makes a retry safe: the card already saved under it is
   * returned instead of a second one. Omit it for a fresh id.
   */
  id?: string;
  projectCwd: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  baseRef: string | null;
};

export class CardInputError extends Error {}

/** A card needs a local git checkout: worktrees and snapshots run on this machine. */
async function assertLocalRepository(ports: EnginePorts, projectCwd: string): Promise<void> {
  if (!ports.projects().some((path) => pathKey(path) === pathKey(projectCwd)))
    throw new CardInputError("Choose one of the projects on the rail.");
  if (projectCwd.startsWith(REMOTE_PATH_PREFIX))
    throw new CardInputError("Task Board supports local projects only.");
  try {
    await ports.git.snapshot(projectCwd);
  } catch (error: unknown) {
    throw new CardInputError(`Choose a git project with at least one commit (${errorText(error)}).`);
  }
}

/** A retry can land after the card was saved but before its task snapshot was. */
async function withTaskArtifact(ports: EnginePorts, card: Card): Promise<Card> {
  const artifacts = await ports.store.listArtifacts(card.id);
  if (!artifacts.some((meta) => meta.kind === "task")) {
    await ports.store.writeArtifact({ cardId: card.id, kind: "task", source: "user", body: formatTask(card) });
  }
  return card;
}

export async function createCard(ports: EnginePorts, input: NewCard): Promise<Card> {
  if (input.id) {
    const saved = await ports.store.getCard(input.id);
    if (saved) return withTaskArtifact(ports, saved);
  }

  await assertLocalRepository(ports, input.projectCwd);
  const id = input.id ?? ports.newId();
  let card: Card;
  try {
    card = await ports.store.createCard({
      id,
      projectCwd: input.projectCwd,
      title: input.title.trim(),
      description: input.description.trim(),
      acceptanceCriteria: input.acceptanceCriteria.trim(),
      baseRef: input.baseRef?.trim() || null,
    });
  } catch (error: unknown) {
    // A concurrent retry with the same id won the insert; hand back its card.
    const raced = input.id ? await ports.store.getCard(input.id) : null;
    if (!raced) throw error;
    return withTaskArtifact(ports, raced);
  }

  await ports.store.writeArtifact({
    cardId: card.id,
    kind: "task",
    source: "user",
    body: formatTask(card),
  });
  return card;
}
