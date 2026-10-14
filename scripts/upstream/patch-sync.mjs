import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEEP_PHRASES, RENAMES, VERBATIM_PATHS } from "./rename-map.mjs";
import { countTokens, createRenamer } from "./rename-upstream.mjs";

export const STATE_FILE = ".github/upstream-sync.json";

export const SYNC_STATUS = {
  UP_TO_DATE: "up-to-date",
  APPLIED: "applied",
  CONFLICTS: "conflicts",
  DIVERGED: "diverged",
};

const EMPTY_BLOB = /^0+$/;

function git(cwd, args, input, { encoding = "utf8", env } = {}) {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding,
    env: env ? { ...process.env, ...env } : undefined,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function isAncestor(cwd, ancestor, descendant) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function lines(output) {
  return output.split("\n").filter(Boolean);
}

export function readSyncState(cwd) {
  return JSON.parse(readFileSync(join(cwd, STATE_FILE), "utf8"));
}

function writeSyncState(cwd, state) {
  writeFileSync(join(cwd, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function createTreeRenamer(cwd) {
  const words = RENAMES.flatMap(({ from, to }) => [from, to]).join("|");
  let matches = "";
  try {
    matches = git(cwd, ["grep", "-I", "-h", "-o", "-i", "-E", `[A-Za-z0-9_$-]*(${words})[A-Za-z0-9_$-]*`, "HEAD"]);
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  return createRenamer({
    renames: RENAMES,
    keepPhrases: KEEP_PHRASES,
    paths: lines(git(cwd, ["ls-tree", "-r", "--name-only", "HEAD"])),
    treeCounts: countTokens(matches, RENAMES),
  });
}

function readBlob(cwd, rev) {
  return git(cwd, ["cat-file", "-p", rev], undefined, { encoding: "buffer" });
}

function headBlob(cwd, path) {
  try {
    return git(cwd, ["rev-parse", `HEAD:${path}`]).trim();
  } catch {
    return undefined;
  }
}

function headText(cwd, path) {
  try {
    return git(cwd, ["show", `HEAD:${path}`]);
  } catch {
    return undefined;
  }
}

/**
 * Rewrites upstream's `from..to` diff into MOLFAR's names: both sides of every
 * changed file are translated, stored as blobs, and diffed as two trees, so
 * the result still carries real preimage blobs for a three-way apply. Files
 * a three-way apply cannot handle (deleted on one side, changed on the other)
 * are left out of the patch and reported in `unapplied`.
 */
function renamedPatch(cwd, from, to) {
  const renamer = createTreeRenamer(cwd);
  const scratch = mkdtempSync(join(tmpdir(), "molfar-upstream-"));
  const sides = { before: [], after: [] };
  const remapped = [];
  const unapplied = [];

  try {
    const raw = git(cwd, ["diff", "--raw", "--no-abbrev", "--no-renames", "-z", from, to]).split("\0").filter(Boolean);

    for (let i = 0; i < raw.length; i += 2) {
      const [modeBefore, modeAfter, blobBefore, blobAfter] = raw[i].slice(1).split(" ");
      const path = raw[i + 1];
      const verbatim = VERBATIM_PATHS.some((pattern) => pattern.test(path));
      const target = verbatim ? path : renamer.mapPath(path);
      const context = { fromFile: path, toFile: target, fileText: headText(cwd, target) };
      if (target !== path) remapped.push(`${path} -> ${target}`);

      const store = (blob) => {
        if (verbatim) return blob;
        const content = readBlob(cwd, blob);
        if (content.includes(0)) return blob;
        const translated = renamer.translate(content.toString("utf8"), context);
        return git(cwd, ["hash-object", "-w", "--stdin"], translated).trim();
      };

      const ours = headBlob(cwd, target);
      const preimage = EMPTY_BLOB.test(blobBefore) ? undefined : store(blobBefore);
      const deleted = EMPTY_BLOB.test(blobAfter);

      if (preimage && !ours) {
        if (!deleted) unapplied.push({ path: target, reason: "changed upstream, deleted in MOLFAR" });
        continue;
      }
      if (deleted && ours !== preimage) {
        unapplied.push({ path: target, reason: "deleted upstream, changed in MOLFAR" });
        continue;
      }

      if (preimage) sides.before.push(`${modeBefore} ${preimage}\t${target}`);
      if (!deleted) sides.after.push(`${modeAfter} ${store(blobAfter)}\t${target}`);
    }

    const [before, after] = ["before", "after"].map((side) => {
      const env = { GIT_INDEX_FILE: join(scratch, side) };
      git(cwd, ["update-index", "--add", "--index-info"], sides[side].map((entry) => `${entry}\n`).join(""), { env });
      return git(cwd, ["write-tree"], undefined, { env }).trim();
    });

    return { patch: git(cwd, ["diff", "--binary", "--find-renames", before, after]), remapped, unapplied };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function applyPatch(cwd, patch) {
  try {
    git(cwd, ["apply", "--3way", "--index", "--whitespace=nowarn", "-"], patch);
  } catch (error) {
    const conflicts = lines(git(cwd, ["diff", "--name-only", "--diff-filter=U"]));
    if (conflicts.length === 0) {
      throw new Error(`git apply failed without leaving conflicts: ${error.stderr ?? error.message}`);
    }
  }

  return lines(git(cwd, ["diff", "--name-only", "--diff-filter=U"]));
}

/**
 * Applies upstream's changes since the last synced commit to the index and
 * working tree as a three-way patch, and records `target` as synced. Paths and
 * identifiers MOLFAR renamed (see rename-map.mjs) are translated first.
 * MOLFAR's `main` shares no commits with upstream, so a merge would pull every
 * upstream author into its history; a patch keeps the content and leaves
 * authorship to the sync commit.
 */
export function applyUpstreamPatch({ cwd, target }) {
  const state = readSyncState(cwd);
  const from = state.syncedCommit;
  const to = git(cwd, ["rev-parse", `${target}^{commit}`]).trim();

  const none = { commits: [], remapped: [], unapplied: [], conflicts: [] };
  if (from === to) return { status: SYNC_STATUS.UP_TO_DATE, from, to, ...none };
  if (!isAncestor(cwd, from, to)) return { status: SYNC_STATUS.DIVERGED, from, to, ...none };

  const commits = lines(git(cwd, ["log", "--reverse", "--no-merges", "--format=%h %s", `${from}..${to}`]));
  const { patch, remapped, unapplied } = renamedPatch(cwd, from, to);
  const conflicts = patch ? applyPatch(cwd, patch) : [];

  writeSyncState(cwd, { ...state, syncedCommit: to });
  git(cwd, ["add", "--", STATE_FILE]);

  const status = conflicts.length + unapplied.length > 0 ? SYNC_STATUS.CONFLICTS : SYNC_STATUS.APPLIED;
  return { status, from, to, commits, remapped, unapplied, conflicts };
}
