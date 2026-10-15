import type { Card } from "../../types/card";

/** `task-<n>.md`: the card as the user wrote it, snapshotted on create and edit. */
export function formatTask(
  card: Pick<Card, "number" | "title" | "projectCwd" | "baseRef" | "description" | "acceptanceCriteria">,
): string {
  const criteria = card.acceptanceCriteria.trim() || "(none given; derive them in the spec)";
  return [
    `# #${card.number} ${card.title}`,
    "",
    `- Project: ${card.projectCwd}`,
    `- Base branch: ${card.baseRef ?? "(project default)"}`,
    "",
    "## Description",
    "",
    card.description.trim(),
    "",
    "## Acceptance criteria",
    "",
    criteria,
  ].join("\n");
}
