import type { TaskBoardRuntime } from "../../task-board/hooks/use-task-board-engine";
import { needsYou } from "../../task-board/model/attention";
import type { NewCard } from "../../task-board/services/card-create";
import type { Card } from "../../task-board/types/card";

/**
 * How an agent with app access learns that it can file board cards. The card
 * template itself lives in the CLI help, so only threads that file one pay for it.
 */
export function boardTaskRule(cli: string): string {
  return `When the user asks to add a task, ticket or card to the Task Board, write the card yourself from this conversation and file it with \`${cli} board.create\`: run \`${cli} --help\` first and follow the template in its board.create entry. Create it at once when the user said to create it now; otherwise show the title and three scope bullets and wait for a yes. Never write to the board's database or files directly.`;
}

/** What the app CLI returns about a card: enough to cite and find it, no artifacts. */
export type AppBoardCard = {
  id: string;
  number: number;
  title: string;
  project: string;
  column: Card["columnId"];
  runState: Card["runState"];
  needsYou: boolean;
  branch?: string;
  updatedAt: number;
};

function summary(card: Card, sessionNeedsInput: boolean): AppBoardCard {
  return {
    id: card.id,
    number: card.number,
    title: card.title,
    project: card.projectCwd,
    column: card.columnId,
    runState: card.runState,
    needsYou: needsYou(card, sessionNeedsInput),
    ...(card.branch ? { branch: card.branch } : {}),
    updatedAt: card.updatedAt,
  };
}

export async function listBoardCards(
  board: TaskBoardRuntime,
  cwd: string,
  archived: boolean,
): Promise<AppBoardCard[]> {
  const { store } = board.ports;
  const [cards, runs] = await Promise.all([store.listCards(cwd, archived), store.runningRuns()]);
  const runSessions = new Map(runs.map((run) => [run.cardId, run.sessionId]));

  return cards.map((card) => {
    const sessionId = runSessions.get(card.id);
    return summary(card, Boolean(sessionId && board.needsInput(sessionId)));
  });
}

function sameCard(card: Card, input: NewCard): boolean {
  return (
    card.projectCwd === input.projectCwd &&
    card.title === input.title.trim() &&
    card.description === input.description.trim() &&
    card.acceptanceCriteria === input.acceptanceCriteria.trim() &&
    card.baseRef === (input.baseRef?.trim() || null)
  );
}

/** The id comes from the request, so a retry returns the card it already made. */
export async function createBoardCard(
  board: TaskBoardRuntime,
  input: NewCard & { id: string },
): Promise<AppBoardCard> {
  const card = await board.create(input);
  if (!sameCard(card, input)) throw new Error("Request ID was already used for another card");
  return summary(card, false);
}
