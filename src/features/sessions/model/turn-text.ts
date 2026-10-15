import type { Block } from "./session";

/**
 * Everything the agent wrote in the session's latest turn, in full. Settlement
 * outcomes keep only a capped tail, so callers that parse structured output
 * read the transcript instead.
 */
export function lastTurnAssistantText(blocks: readonly Block[]): string {
  let start = blocks.length;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    if (block.role === "user" && !block.draft) {
      start = index + 1;
      break;
    }
  }

  return blocks
    .slice(start)
    .filter((block) => block.role === "assistant" && block.text.trim())
    .map((block) => block.text)
    .join("\n");
}
