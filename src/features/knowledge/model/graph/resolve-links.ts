import type { VaultLink, VaultNote } from "../vault/types";
import type { LinkResolution, NoteIndex } from "./types";

export function normalizeVaultPath(path: string): string | null {
  if (/^(?:\/|[A-Za-z]:|\\)/.test(path)) return null;
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

export function noteIndex(notes: VaultNote[]): NoteIndex {
  const paths = new Map<string, VaultNote>();
  const names = new Map<string, Set<string>>();
  for (const note of notes) {
    paths.set(note.path, note);
    const basename = note.path.split("/").pop() ?? note.path;
    for (const name of [
      basename,
      basename.replace(/\.(?:md|markdown)$/i, ""),
      ...note.aliases,
    ]) {
      const key = name.toLocaleLowerCase();
      const matches = names.get(key) ?? new Set<string>();
      matches.add(note.path);
      names.set(key, matches);
    }
  }

  return { paths, names };
}

export function resolveVaultLink(
  index: NoteIndex,
  source: string,
  link: VaultLink,
): LinkResolution {
  let target = link.target.trim().split("|")[0]?.trim() ?? "";
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//"))
    return { state: "attachment" };
  target = target.split("#")[0] ?? "";
  try {
    target = decodeURIComponent(target);
  } catch {
    return { state: "missing" };
  }
  if (!target) return { state: "resolved", path: source };

  const parent = source.split("/").slice(0, -1).join("/");
  const relative = normalizeVaultPath(`${parent ? `${parent}/` : ""}${target}`);
  const rootPath = normalizeVaultPath(target);
  const candidates =
    link.kind === "markdown" ? [relative] : [rootPath, relative];
  for (const candidate of candidates) {
    if (candidate === null) continue;
    for (const path of [
      candidate,
      `${candidate}.md`,
      `${candidate}.markdown`,
    ]) {
      if (index.paths.has(path)) return { state: "resolved", path };
    }
  }

  if (link.kind === "wiki" && !target.includes("/")) {
    const matches = index.names.get(target.toLocaleLowerCase());
    if (matches && matches.size > 1) return { state: "ambiguous" };
    const [path] = matches ?? [];
    if (path) return { state: "resolved", path };
  }

  if (/\.[^/\.]+$/.test(target) && !/\.(?:md|markdown)$/i.test(target))
    return { state: "attachment", path: relative ?? rootPath ?? undefined };

  return { state: "missing" };
}
