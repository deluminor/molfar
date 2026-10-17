/**
 * Toggle a GFM/Obsidian task-list checkbox in Markdown source by its
 * document order among `- [ ]` / `- [x]` items (fences and indented code skipped).
 *
 * @returns Updated body, or `null` when `index` is out of range.
 */
export function toggleMarkdownTask(
  body: string,
  index: number,
  checked: boolean,
): string | null {
  if (index < 0 || !Number.isInteger(index)) return null;

  let fence: string | null = null;
  let seen = 0;
  const lines = body.split(/\r?\n/);
  const mark = checked ? "x" : " ";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      const token = marker[1] ?? "";
      if (fence === null) fence = token;
      else if (token[0] === fence[0] && token.length >= fence.length) fence = null;
      continue;
    }
    if (fence || /^ {4}/.test(line)) continue;

    const match = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](\s+)/);
    if (!match) continue;
    if (seen !== index) {
      seen += 1;
      continue;
    }

    const prefix = match[1] ?? "";
    const gap = match[3] ?? " ";
    lines[i] = `${prefix}[${mark}]${gap}${line.slice(match[0].length)}`;
    return lines.join("\n");
  }

  return null;
}
