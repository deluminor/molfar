import type { ReactNode } from "react";

/** Extra left inset per nesting level for Jira cascade rows. */
export const INBOX_TREE_INDENT_STEP_PX = 18;

/** Base padding before depth-based indent. */
export const INBOX_TREE_INDENT_BASE_PX = 8;

/**
 * Thin vertical stub + corner into the child row gutter.
 * Only rendered for depth ≥ 1 (Jira cascade); other sources stay depth 0.
 */
export function InboxTreeGutter({ depth }: { depth: number }): ReactNode {
  if (depth <= 0) return null;

  const left = INBOX_TREE_INDENT_BASE_PX + (depth - 1) * INBOX_TREE_INDENT_STEP_PX;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-5"
      style={{ left }}
    >
      <span className="absolute bottom-1/2 left-[9px] top-0 w-px bg-content/20" />
      <span className="absolute left-[9px] top-1/2 h-px w-2.5 bg-content/20" />
    </span>
  );
}

export function inboxTreeIndentPx(depth: number): number {
  return INBOX_TREE_INDENT_BASE_PX + depth * INBOX_TREE_INDENT_STEP_PX;
}
