/** Bundled MOLFAR skill: turn the current conversation into a Task Board card. */
export const CREATE_BOARD_TASK_SKILL_NAME = "create-board-task";

export const CREATE_BOARD_TASK_SKILL_DESCRIPTION =
  "Turn the current conversation into a well-written Task Board card in the project's Backlog. Use when the user asks to create a task, ticket, card or backlog item on the board.";

export const CREATE_BOARD_TASK_SKILL_BODY = `---
name: create-board-task
description: ${CREATE_BOARD_TASK_SKILL_DESCRIPTION}
---

# Create a Task Board card

The user invoked this skill, so they want a card now: create it without asking for confirmation.

1. If the MOLFAR app CLI is not available in this thread, ask the user to send \`/operator\` once. Never write to the board's database or files, and never use the Companion gateway.
2. Run \`app --help\` and follow the template in its \`board.create\` entry: title, the description sections, and \`AC-n\` acceptance criteria. That entry is the one source of the card format.
3. Write the card in English from what this conversation settled. Do not re-research the codebase unless the card would be wrong without it, and do not ask for anything the conversation already answers.
4. File it with \`app board.create\`, passing the JSON on stdin with \`--input -\` and a stable \`--request-id\`. Reuse that request ID if you retry.
5. Reply with the card number, title and column in one line.
`;
