import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsInIndex, git, isAncestor, lines } from "./git.mjs";

export const MOVE_MAP_FILE = ".github/upstream-moves.json";

export const PATH_ACTION = {
  APPLY: "apply",
  RETARGET: "retarget",
  SPLIT: "split",
  REMOVED: "removed",
  UNMAPPED: "unmapped",
};

const EMPTY_MAP = { refactorBase: null, renames: {}, splits: {}, removed: {} };

export function readMoveMap(cwd) {
  const file = join(cwd, MOVE_MAP_FILE);
  if (!existsSync(file)) return EMPTY_MAP;

  return { ...EMPTY_MAP, ...JSON.parse(readFileSync(file, "utf8")) };
}

export function writeMoveMap(cwd, map) {
  const sorted = {
    refactorBase: map.refactorBase,
    renames: sortKeys(map.renames),
    splits: sortKeys(map.splits),
    removed: sortKeys(map.removed),
  };
  writeFileSync(
    join(cwd, MOVE_MAP_FILE),
    `${JSON.stringify(sorted, null, 2)}\n`,
  );
}

function sortKeys(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Where an upstream change to `path` (a pre-refactor path) has to go in Vatra's tree. */
export function resolvePath(cwd, map, path) {
  const split = map.splits[path];
  if (split)
    return {
      action: PATH_ACTION.SPLIT,
      targets: split.targets,
      notes: split.notes,
    };

  if (existsInIndex(cwd, path)) return { action: PATH_ACTION.APPLY, path };

  const renamed = map.renames[path];
  if (renamed && existsInIndex(cwd, renamed))
    return { action: PATH_ACTION.RETARGET, path: renamed };

  const removed = map.removed[path];
  if (removed) return { action: PATH_ACTION.REMOVED, notes: removed };

  return { action: PATH_ACTION.UNMAPPED };
}

function changesSinceBase(cwd, refactorBase) {
  const renames = {};
  const deleted = [];

  for (const line of lines(
    git(cwd, [
      "diff",
      "--cached",
      "--name-status",
      "--find-renames",
      refactorBase,
    ]),
  )) {
    const [status, source, destination] = line.split("\t");
    if (status.startsWith("R")) renames[source] = destination;
    if (status === "D") deleted.push(source);
  }

  return { renames, deleted };
}

/**
 * Adds renames git detects between `refactorBase` and the index. Recorded entries win while their
 * target exists: they come from codemods or by hand, and similarity detection can pair the wrong
 * files when contents match. Paths described as splits or removals are never treated as renames.
 */
export function regenerateMoveMap(cwd, map) {
  const { renames: detected } = changesSinceBase(cwd, map.refactorBase);
  const describedElsewhere = (source) =>
    Boolean(map.splits[source] || map.removed[source]);

  const fresh = Object.entries(detected).filter(
    ([source]) => !describedElsewhere(source),
  );
  const recorded = Object.entries(map.renames).filter(
    ([source, target]) =>
      !describedElsewhere(source) && existsInIndex(cwd, target),
  );

  return {
    ...map,
    renames: { ...Object.fromEntries(fresh), ...Object.fromEntries(recorded) },
  };
}

export function validateMoveMap(cwd, map) {
  if (!map.refactorBase) return [`${MOVE_MAP_FILE}: refactorBase is not set`];
  if (!isAncestor(cwd, map.refactorBase, "HEAD")) {
    return [
      `${MOVE_MAP_FILE}: refactorBase ${map.refactorBase} is not an ancestor of HEAD`,
    ];
  }

  const problems = [];
  const { renames, deleted } = changesSinceBase(cwd, map.refactorBase);

  for (const [source, destination] of Object.entries(renames)) {
    if (!map.renames[source] && !map.splits[source] && !map.removed[source]) {
      problems.push(
        `rename ${source} -> ${destination} is missing; run node scripts/upstream/moves.mjs`,
      );
    }
  }

  for (const [source, destination] of Object.entries(map.renames)) {
    if (!existsInIndex(cwd, destination))
      problems.push(
        `rename target ${destination} (from ${source}) does not exist`,
      );
  }

  for (const [source, split] of Object.entries(map.splits)) {
    if (!Array.isArray(split.targets) || split.targets.length === 0)
      problems.push(`split ${source} has no targets`);
    if (!split.notes) problems.push(`split ${source} has no notes`);
    for (const target of split.targets ?? []) {
      if (!existsInIndex(cwd, target))
        problems.push(`split target ${target} (from ${source}) does not exist`);
    }
  }

  for (const source of deleted) {
    const covered =
      map.renames[source] || map.splits[source] || map.removed[source];
    if (!covered)
      problems.push(
        `${source} was removed since refactorBase but is not in renames, splits or removed`,
      );
  }

  return problems;
}
