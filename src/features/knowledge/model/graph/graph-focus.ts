import type { KnowledgeGraphLink } from "./types";

export function graphFocus(
  links: KnowledgeGraphLink[],
  selectedPath: string | null,
): ReadonlySet<string> | null {
  if (!selectedPath) return null;

  const focus = new Set([selectedPath]);
  for (const link of links) {
    if (link.source === selectedPath) focus.add(link.target);
    if (link.target === selectedPath) focus.add(link.source);
  }

  return focus;
}
