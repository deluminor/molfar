import {
  noteIndex,
  resolveVaultLink,
} from "../../knowledge/model/graph/resolve-links";
import type {
  VaultConnection,
  VaultDocument,
  VaultNote,
  VaultSnapshot,
} from "../../knowledge/model/vault/types";
import type {
  CompanionVaultIndex,
  CompanionVaultLink,
  CompanionVaultNote,
} from "./protocol";

export type VaultAccess = {
  status: () => Promise<VaultConnection | null>;
  scan: (vaultId: string) => Promise<VaultSnapshot>;
  read: (vaultId: string, path: string) => Promise<VaultDocument>;
  save: (
    vaultId: string,
    path: string,
    body: string,
    revision: string,
  ) => Promise<VaultDocument>;
};

/** A phone browsing the vault should not rescan it on every tap. */
const SNAPSHOT_TTL_MS = 60_000;
const SCAN_BUSY_RETRIES = 6;
const SCAN_BUSY_WAIT_MS = 1_500;
/** The same bound Knowledge puts on a note sent to an agent. */
const BODY_MAX = 128 * 1024;
const NOTES_MAX = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolvedLinks(
  index: ReturnType<typeof noteIndex>,
  path: string,
  note: VaultNote,
): CompanionVaultLink[] {
  return note.links.flatMap((link) => {
    const resolved = resolveVaultLink(index, path, link);
    return resolved.state === "resolved" && resolved.path
      ? [{ target: link.target, path: resolved.path }]
      : [];
  });
}

/**
 * Access to the connected Obsidian vault for the companion. It reuses the
 * desktop's scanner and link resolution, and keeps one snapshot warm.
 */
export function createCompanionVault(access: VaultAccess, now = () => Date.now()) {
  let cached: { snapshot: VaultSnapshot; at: number } | null = null;

  const snapshot = async (connection: VaultConnection): Promise<VaultSnapshot> => {
    if (
      cached &&
      cached.snapshot.connection.id === connection.id &&
      now() - cached.at < SNAPSHOT_TTL_MS
    )
      return cached.snapshot;
    for (let attempt = 0; ; attempt++) {
      try {
        const fresh = await access.scan(connection.id);
        cached = { snapshot: fresh, at: now() };
        return fresh;
      } catch (error) {
        const busy = String(error).includes("already running");
        // Knowledge on the desktop may be scanning; its result lands in our next try.
        if (!busy || attempt >= SCAN_BUSY_RETRIES) {
          if (cached?.snapshot.connection.id === connection.id) return cached.snapshot;
          throw error;
        }
        await sleep(SCAN_BUSY_WAIT_MS);
      }
    }
  };

  const connected = async (): Promise<VaultConnection | null> => access.status();

  const invalidate = () => {
    cached = null;
  };

  const readNote = async (path: string): Promise<CompanionVaultNote> => {
    const connection = await connected();
    if (!connection) throw new Error("No Knowledge vault is connected in MOLFAR");
    const snap = await snapshot(connection);
    const note = snap.notes.find((entry) => entry.path === path);
    if (!note) throw new Error("That note is not in the vault");
    const document = await access.read(connection.id, path);
    const index = noteIndex(snap.notes);
    const backlinks = snap.notes
      .filter(
        (other) =>
          other.path !== path &&
          other.links.some((link) => {
            const resolved = resolveVaultLink(index, other.path, link);
            return resolved.state === "resolved" && resolved.path === path;
          }),
      )
      .map((other) => ({ path: other.path, title: other.title }));
    return {
      path,
      title: note.title,
      tags: note.tags,
      body:
        document.body.length > BODY_MAX
          ? `${document.body.slice(0, BODY_MAX)}\n\n…`
          : document.body,
      truncated: document.body.length > BODY_MAX,
      revision: document.revision,
      links: resolvedLinks(index, path, note),
      backlinks,
    };
  };

  return {
    async index(): Promise<CompanionVaultIndex> {
      const connection = await connected();
      if (!connection) return { connected: false };
      const snap = await snapshot(connection);
      const notes = [...snap.notes]
        .sort((a, b) => a.path.localeCompare(b.path))
        .slice(0, NOTES_MAX);
      const index = noteIndex(notes);
      return {
        connected: true,
        name: connection.name,
        notes: notes.map((note) => ({
          path: note.path,
          title: note.title,
          tags: note.tags,
          aliases: note.aliases,
          links: resolvedLinks(index, note.path, note),
        })),
        truncated: snap.truncated || snap.notes.length > NOTES_MAX,
      };
    },

    read: readNote,

    async write(
      path: string,
      body: string,
      ifRevision: string,
    ): Promise<CompanionVaultNote> {
      const connection = await connected();
      if (!connection) throw new Error("No Knowledge vault is connected in MOLFAR");
      const snap = await snapshot(connection);
      if (!snap.notes.some((entry) => entry.path === path))
        throw new Error("That note is not in the vault");
      await access.save(connection.id, path, body, ifRevision);
      invalidate();
      return readNote(path);
    },
  };
}
