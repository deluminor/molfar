const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const PR_TITLE = /^pr_title:\s*["']?(.+?)["']?\s*$/m;
const MAX_TITLE = 120;

/** The conventional-commit PR title Grill proposes, if any. */
export function specPrTitle(spec: string): string | undefined {
  const header = FRONTMATTER.exec(spec.replace(/\r\n?/g, "\n").trimStart());
  const title = header ? PR_TITLE.exec(header[1])?.[1].trim() : undefined;
  if (!title || title.length > MAX_TITLE) return undefined;
  return title;
}
