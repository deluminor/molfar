import type { VaultEntry, VaultNote } from "../vault/types";
import {
  normalizeVaultPath,
  noteIndex,
  resolveVaultLink,
} from "../graph/resolve-links";
import { linkDestination } from "./link-destination";

function labelText(value: string): string {
  return value.replace(/[\[\]\\]/g, "\\$&").replace(/\r?\n/g, " ");
}

function assetTarget(
  target: string,
  source: string,
  entries: VaultEntry[],
): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(target.split("#")[0] ?? target);
  } catch {
    return null;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith("//"))
    return null;
  const parent = source.split("/").slice(0, -1).join("/");
  const relative = normalizeVaultPath(
    `${parent ? `${parent}/` : ""}${decoded}`,
  );
  const root = normalizeVaultPath(decoded);
  const files = entries.filter((entry) => !entry.isDir);
  for (const candidate of [relative, root]) {
    if (candidate && files.some((entry) => entry.path === candidate))
      return candidate;
  }
  if (!decoded.includes("/")) {
    const matches = files.filter((entry) => entry.name === decoded);
    if (matches.length === 1) return matches[0].path;
  }

  return null;
}

export function prepareVaultPreview(
  body: string,
  notes: VaultNote[],
  selectedPath: string,
  entries: VaultEntry[] = [],
): string {
  const index = noteIndex(notes);
  let fence: string | null = null;
  const convert = (text: string): string => {
    let result = text.replace(
      /(!?)\[\[([^\]\n]+)\]\]/g,
      (_match, embed: string, contents: string) => {
        const [target = "", alias] = contents.split("|");
        const label = labelText(alias || target);
        const resolved = resolveVaultLink(index, selectedPath, {
          target,
          kind: "wiki",
        });
        if (resolved.state === "resolved" && resolved.path)
          return `[${label}](#knowledge=${encodeURIComponent(resolved.path)})`;
        if (resolved.state === "attachment") {
          const path = assetTarget(target, selectedPath, entries);
          if (path && embed && /\.(?:png|jpe?g|gif|webp|avif)$/i.test(path))
            return `![${label}](knowledge-asset/${encodeURIComponent(path)})`;
          return `${label} (attachment)`;
        }

        return `${label} (${resolved.state} link)`;
      },
    );
    result = result.replace(
      /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g,
      (match: string, image: string, label: string, raw: string) => {
        const target = linkDestination(raw);
        if (target.startsWith("#knowledge=")) return match;
        if (target.startsWith("knowledge-asset/")) {
          let decoded: string;
          try {
            decoded = decodeURIComponent(target.slice(16));
          } catch {
            return `${labelText(label || target)} (invalid attachment link)`;
          }
          if (
            image &&
            entries.some((entry) => entry.path === decoded && !entry.isDir)
          )
            return match;

          return `${labelText(label || target)} (attachment unavailable)`;
        }
        if (image) {
          const path = assetTarget(target, selectedPath, entries);
          if (path && /\.(?:png|jpe?g|gif|webp|avif)$/i.test(path))
            return `![${label}](knowledge-asset/${encodeURIComponent(path)})`;

          return `${labelText(label || target)} (image unavailable)`;
        }
        if (/^https?:\/\//i.test(target)) return match;
        const resolved = resolveVaultLink(index, selectedPath, {
          target,
          kind: "markdown",
        });
        if (resolved.state === "resolved" && resolved.path)
          return `[${label}](#knowledge=${encodeURIComponent(resolved.path)})`;

        return `${labelText(label || target)} (${resolved.state} link)`;
      },
    );

    return result;
  };

  // Unresolvable definitions are dropped so reference links render as inert text instead of navigating the webview.
  const define = (line: string, prefix: string, raw: string): string => {
    const target = linkDestination(raw);
    if (/^https?:\/\//i.test(target) || target.startsWith("#knowledge="))
      return line;
    const resolved = resolveVaultLink(index, selectedPath, {
      target,
      kind: "markdown",
    });
    if (resolved.state === "resolved" && resolved.path)
      return `${prefix} #knowledge=${encodeURIComponent(resolved.path)}`;

    return "";
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (fence === null) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
          fence = null;
        return line;
      }
      if (fence || /^ {4}/.test(line)) return line;
      const definition = line.match(/^( {0,3}\[(?!\^)[^\]]+\]:)\s*(\S.*)$/);
      if (definition) return define(line, definition[1], definition[2]);

      return line
        .split(/(`+[^`]*`+)/g)
        .map((part) => (part.startsWith("`") ? part : convert(part)))
        .join("");
    })
    .join("\n");
}

export function vaultPreviewAssetPaths(markdown: string): string[] {
  const paths = new Set<string>();
  for (const match of markdown.matchAll(/\]\(knowledge-asset\/([^\s)]+)\)/g)) {
    let path: string;
    try {
      path = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    if (normalizeVaultPath(path) === path) paths.add(path);
  }

  return [...paths];
}
