import type { ReactNode } from "react";

/** Extra left inset per nesting level for Jira cascade rows. */
export const INBOX_TREE_INDENT_STEP_PX = 16;

/** Base padding before depth-based indent (matches flat row inset). */
export const INBOX_TREE_INDENT_BASE_PX = 8;

/** List `gap-0.5` (2px) — extend the rail so it reads continuous across rows. */
const INBOX_TREE_GAP_PX = 2;

/**
 * Continuous vertical rail + elbow into the child row.
 * Painted absolute in the indent gutter (does not shift content).
 * Only rendered for depth ≥ 1 (Jira cascade); other sources stay depth 0.
 */
export function InboxTreeGutter({
  depth,
  isLast = false,
}: {
  depth: number;
  isLast?: boolean;
}): ReactNode {
  if (depth <= 0) return null;

  const left = INBOX_TREE_INDENT_BASE_PX + (depth - 1) * INBOX_TREE_INDENT_STEP_PX;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-5"
      style={{ left }}
    >
      <span
        className="absolute left-[9px] w-px bg-content/25"
        style={{
          top: 0,
          bottom: isLast ? "50%" : -INBOX_TREE_GAP_PX,
        }}
      />
      <span className="absolute left-[9px] top-1/2 h-px w-2.5 bg-content/25" />
    </span>
  );
}

export function inboxTreeIndentPx(depth: number): number {
  return INBOX_TREE_INDENT_BASE_PX + depth * INBOX_TREE_INDENT_STEP_PX;
}
