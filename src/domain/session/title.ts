import {
  type HarnessId,
  HARNESS_LABEL,
  HARNESS_TITLE,
} from "../harness/harness";
import type { Attachment } from "./attachment";

/** First line of a prompt, truncated for the tab strip. */
export function titleFromPrompt(
  prompt: string,
  harness: HarnessId,
  attachments: Attachment[] = [],
): string {
  const line = prompt.trim().split(/\r?\n/)[0]?.trim() ?? "";
  const fromFiles =
    !line && attachments.length > 0
      ? attachments
          .map((file) => file.name)
          .filter(Boolean)
          .slice(0, 3)
          .join(", ")
      : "";
  const seed = line || fromFiles;
  if (!seed) return HARNESS_LABEL[harness];
  const max = 72;
  const short = seed.length > max ? `${seed.slice(0, max - 1)}…` : seed;
  return formatSessionTitle(harness, short);
}

export function formatSessionTitle(harness: HarnessId, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return HARNESS_LABEL[harness];
  return `${HARNESS_LABEL[harness]} · ${trimmed}`;
}
/** True when the stored title is still a placeholder the LLM may replace. */
export function canReplaceSessionTitle(
  current: string,
  harness: HarnessId,
  seed: string,
): boolean {
  return (
    current === seed ||
    current === HARNESS_LABEL[harness] ||
    current === HARNESS_TITLE[harness]
  );
}
/** Title without the harness prefix stored for the tab strip. */
export function sessionDisplayTitle(title: string, harness: HarnessId): string {
  const prefix = `${HARNESS_LABEL[harness]} · `;
  if (title.startsWith(prefix)) return title.slice(prefix.length);
  if (title === HARNESS_LABEL[harness] || title === HARNESS_TITLE[harness]) {
    return "New session";
  }
  return title;
}
