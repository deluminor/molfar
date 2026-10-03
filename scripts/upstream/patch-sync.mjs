import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STATE_FILE = ".github/upstream-sync.json";

export const SYNC_STATUS = {
  UP_TO_DATE: "up-to-date",
  APPLIED: "applied",
  CONFLICTS: "conflicts",
  DIVERGED: "diverged",
};

function git(cwd, args, input) {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
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
 * working tree as a three-way patch, and records `target` as synced.
 * Vatra's `main` shares no commits with upstream, so a merge would pull every
 * upstream author into its history; a patch keeps the content and leaves
 * authorship to the sync commit.
 */
export function applyUpstreamPatch({ cwd, target }) {
  const state = readSyncState(cwd);
  const from = state.syncedCommit;
  const to = git(cwd, ["rev-parse", `${target}^{commit}`]).trim();

  if (from === to) return { status: SYNC_STATUS.UP_TO_DATE, from, to, commits: [], conflicts: [] };
  if (!isAncestor(cwd, from, to)) return { status: SYNC_STATUS.DIVERGED, from, to, commits: [], conflicts: [] };

  const commits = lines(git(cwd, ["log", "--reverse", "--no-merges", "--format=%h %s", `${from}..${to}`]));
  const patch = git(cwd, ["diff", "--binary", "--find-renames", from, to]);
  const conflicts = patch ? applyPatch(cwd, patch) : [];

  writeSyncState(cwd, { ...state, syncedCommit: to });
  git(cwd, ["add", "--", STATE_FILE]);

  const status = conflicts.length > 0 ? SYNC_STATUS.CONFLICTS : SYNC_STATUS.APPLIED;
  return { status, from, to, commits, conflicts };
}
