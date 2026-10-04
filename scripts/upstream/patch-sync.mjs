import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, isAncestor, lines, unmergedPaths } from "./git.mjs";
import {
  extractionsFor,
  PATH_ACTION,
  readMoveMap,
  resolvePath,
} from "./move-map.mjs";
import { changedPaths, filePatch, retargetPatch } from "./patch-paths.mjs";
import { writePendingPorts } from "./pending-ports.mjs";

export const STATE_FILE = ".github/upstream-sync.json";

export const SYNC_STATUS = {
  UP_TO_DATE: "up-to-date",
  APPLIED: "applied",
  CONFLICTS: "conflicts",
  PENDING: "pending-ports",
  DIVERGED: "diverged",
};

export const PENDING_REASON = {
  ...PATH_ACTION,
  APPLY_FAILED: "apply-failed",
  MOVED_AND_RENAMED: "moved-and-renamed-upstream",
};

const RETARGETABLE_STATUSES = new Set(["M", "D", "T"]);

export function readSyncState(cwd) {
  return JSON.parse(readFileSync(join(cwd, STATE_FILE), "utf8"));
}

function writeSyncState(cwd, state) {
  writeFileSync(join(cwd, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function tryApply(cwd, patch) {
  try {
    git(cwd, ["apply", "--3way", "--index", "--whitespace=nowarn", "-"], patch);
    return null;
  } catch (error) {
    return String(error.stderr ?? error.message).trim();
  }
}

function resolveChange(cwd, map, change) {
  if (change.status === "A")
    return { action: PATH_ACTION.APPLY, path: change.destination };

  const resolved = resolvePath(cwd, map, change.source);
  if (
    resolved.action !== PATH_ACTION.RETARGET ||
    RETARGETABLE_STATUSES.has(change.status)
  )
    return resolved;

  return { action: PENDING_REASON.MOVED_AND_RENAMED, path: resolved.path };
}

function pendingEntry(change, reason, patch, details = {}) {
  const upstreamPath =
    change.destination === change.source ? undefined : change.destination;
  return {
    path: change.source,
    upstreamPath,
    status: change.status,
    reason,
    ...details,
    patch,
  };
}

function applyChange(cwd, range, map, change) {
  const patch = filePatch(cwd, range.from, range.to, change);
  if (!patch) return { kind: "skipped" };

  const resolved = resolveChange(cwd, map, change);
  const retarget = resolved.action === PATH_ACTION.RETARGET;
  if (resolved.action !== PATH_ACTION.APPLY && !retarget) {
    const details = {
      molfarPath: resolved.path,
      targets: resolved.targets,
      notes: resolved.notes,
    };
    return {
      kind: "pending",
      entry: pendingEntry(change, resolved.action, patch, details),
    };
  }

  const target = retarget ? resolved.path : change.destination;
  const error = tryApply(
    cwd,
    retarget ? retargetPatch(patch, change.source, target) : patch,
  );
  if (!error) return { kind: "applied", target, retargeted: retarget };
  if (unmergedPaths(cwd).includes(target)) return { kind: "conflict", target };

  return {
    kind: "pending",
    entry: pendingEntry(change, PENDING_REASON.APPLY_FAILED, patch, { error }),
  };
}

function overallStatus(conflicts, pending) {
  if (pending.length > 0) return SYNC_STATUS.PENDING;
  if (conflicts.length > 0) return SYNC_STATUS.CONFLICTS;
  return SYNC_STATUS.APPLIED;
}

/**
 * Applies upstream's changes since the last synced commit to the index and working tree, one path at
 * a time, and records `target` as synced. MOLFAR's `main` shares no commits with upstream, so a merge
 * would pull every upstream author into its history; a patch keeps the content and leaves authorship
 * to the sync commit. Paths MOLFAR moved are retargeted through the move map; paths it split or
 * removed become pending ports instead of aborting the sync.
 */
export function applyUpstreamPatch({ cwd, target }) {
  const state = readSyncState(cwd);
  const from = state.syncedCommit;
  const to = git(cwd, ["rev-parse", `${target}^{commit}`]).trim();
  const empty = {
    commits: [],
    conflicts: [],
    pending: [],
    retargeted: [],
    added: [],
    extracted: [],
  };

  if (from === to)
    return { status: SYNC_STATUS.UP_TO_DATE, from, to, ...empty };
  if (!isAncestor(cwd, from, to))
    return { status: SYNC_STATUS.DIVERGED, from, to, ...empty };

  const map = readMoveMap(cwd);
  const commits = lines(
    git(cwd, [
      "log",
      "--reverse",
      "--no-merges",
      "--format=%h %s",
      `${from}..${to}`,
    ]),
  );
  const conflicts = [];
  const pending = [];
  const retargeted = [];
  const added = [];
  const extracted = [];

  for (const change of changedPaths(cwd, from, to)) {
    const outcome = applyChange(cwd, { from, to }, map, change);
    if (outcome.kind === "pending") pending.push(outcome.entry);
    if (outcome.kind === "conflict") conflicts.push(outcome.target);
    if (outcome.retargeted)
      retargeted.push({ upstream: change.source, molfar: outcome.target });
    if (outcome.kind === "applied" && change.status === "A")
      added.push(outcome.target);
    const moved = extractionsFor(map, change.source);
    if (moved.length > 0 && outcome.kind !== "pending") {
      extracted.push({ upstream: change.source, molfar: outcome.target, moved });
    }
  }

  const pendingPorts = writePendingPorts(cwd, from, to, pending);
  writeSyncState(cwd, { ...state, syncedCommit: to });
  git(cwd, ["add", "--", STATE_FILE]);

  const status = overallStatus(conflicts, pendingPorts);
  return {
    status,
    from,
    to,
    commits,
    conflicts,
    pending: pendingPorts,
    retargeted,
    added,
    extracted,
  };
}
