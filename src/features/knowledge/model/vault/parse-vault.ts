import type {
  VaultConnection,
  VaultDocument,
  VaultEntry,
  VaultLink,
  VaultNote,
  VaultSnapshot,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Knowledge response: expected an object.");
  }

  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Invalid Knowledge response: expected text.");

  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new Error("Invalid Knowledge response: expected a boolean.");

  return value;
}

function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value))
    throw new Error("Invalid Knowledge response: expected a list.");

  return value.map(parse);
}

export function parseVaultConnection(value: unknown): VaultConnection {
  const item = record(value);

  return {
    id: string(item.id),
    root: string(item.root),
    name: string(item.name),
  };
}

function parseEntry(value: unknown): VaultEntry {
  const item = record(value);

  return {
    path: string(item.path),
    name: string(item.name),
    isDir: boolean(item.isDir),
    isMarkdown: boolean(item.isMarkdown),
  };
}

function parseLink(value: unknown): VaultLink {
  const item = record(value);
  if (item.kind !== "wiki" && item.kind !== "markdown")
    throw new Error("Invalid Knowledge link kind.");

  return { target: string(item.target), kind: item.kind };
}

function parseNote(value: unknown): VaultNote {
  const item = record(value);

  return {
    path: string(item.path),
    title: string(item.title),
    aliases: array(item.aliases, string),
    tags: array(item.tags, string),
    links: array(item.links, parseLink),
  };
}

export function parseVaultSnapshot(value: unknown): VaultSnapshot {
  const item = record(value);

  return {
    connection: parseVaultConnection(item.connection),
    entries: array(item.entries, parseEntry),
    notes: array(item.notes, parseNote),
    warnings: array(item.warnings, string),
    truncated: boolean(item.truncated),
  };
}

export function parseVaultDocument(value: unknown): VaultDocument {
  const item = record(value);

  return {
    path: string(item.path),
    body: string(item.body),
    revision: string(item.revision),
  };
}
