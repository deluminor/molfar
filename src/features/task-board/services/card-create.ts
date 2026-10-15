import { pathKey } from "../../../shared/lib/paths";
import { REMOTE_PATH_PREFIX } from "../../../shared/lib/remotePaths";
import { formatTask } from "../model/artifacts/task";
import type { Card } from "../types/card";
import type { EnginePorts } from "./ports";
import { errorText } from "./stage-fail";

export type NewCard = {
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

export async function createCard(ports: EnginePorts, input: NewCard): Promise<Card> {
  await assertLocalRepository(ports, input.projectCwd);
  const card = await ports.store.createCard({
    id: ports.newId(),
    projectCwd: input.projectCwd,
    title: input.title.trim(),
    description: input.description.trim(),
    acceptanceCriteria: input.acceptanceCriteria.trim(),
    baseRef: input.baseRef?.trim() || null,
  });
  await ports.store.writeArtifact({
    cardId: card.id,
    kind: "task",
    source: "user",
    body: formatTask(card),
  });
  return card;
}
