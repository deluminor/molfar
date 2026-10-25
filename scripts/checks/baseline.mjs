import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Violation counts keyed by file, then by violation kind: `{ "src/a.ts": { "rule": 2 } }`.
 * A baseline freezes today's counts; a check fails when a count grows (regression) and when it
 * shrinks without the baseline being tightened, so fixed violations cannot quietly come back.
 */
export function compareToBaseline(current, baseline) {
  const regressions = [];
  const improvements = [];

  for (const [file, kinds] of Object.entries(current)) {
    for (const [kind, count] of Object.entries(kinds)) {
      const allowed = baseline[file]?.[kind] ?? 0;
      if (count > allowed) regressions.push({ file, kind, count, allowed });
    }
  }

  for (const [file, kinds] of Object.entries(baseline)) {
    for (const [kind, allowed] of Object.entries(kinds)) {
      const count = current[file]?.[kind] ?? 0;
      if (count < allowed) improvements.push({ file, kind, count, allowed });
    }
  }

  return { regressions, improvements };
}

export function sortCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, kinds]) => Object.keys(kinds).length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, kinds]) => [
        file,
        Object.fromEntries(
          Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ]),
  );
}

export function addCount(counts, file, kind, amount = 1) {
  counts[file] ??= {};
  counts[file][kind] = (counts[file][kind] ?? 0) + amount;
}

function totals(counts) {
  const sums = {};
  for (const kinds of Object.values(counts)) {
    for (const [kind, count] of Object.entries(kinds))
      sums[kind] = (sums[kind] ?? 0) + count;
  }
  return sums;
}

/**
 * Why regressions cannot be accepted as moved code: a kind's repo-wide total grew, or (unless
 * allowed) a file that was clean before now has findings. Refactors move code between files, so
 * findings may move with it as long as nothing is added overall.
 */
export function transferBlockers(
  current,
  baseline,
  regressions,
  { allowNewFiles },
) {
  const before = totals(baseline);
  const after = totals(current);
  const blockers = [];

  for (const kind of new Set(
    regressions.map((regression) => regression.kind),
  )) {
    if ((after[kind] ?? 0) > (before[kind] ?? 0)) {
      blockers.push(
        `${kind} total grew ${before[kind] ?? 0} -> ${after[kind]}`,
      );
    }
  }

  if (!allowNewFiles) {
    for (const { file } of regressions) {
      if (!baseline[file]) blockers.push(`${file} is new to the baseline`);
    }
  }

  return blockers;
}

function readBaseline(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function writeBaseline(path, counts) {
  writeFileSync(path, `${JSON.stringify(sortCounts(counts), null, 2)}\n`);
}

function describe({ file, kind, count, allowed }) {
  return `${file}: ${kind} ${allowed} -> ${count}`;
}

/**
 * Shared CLI flow for ratchet checks. `--update` writes the current counts, but only when nothing
 * regressed: it tightens the baseline and never loosens it.
 */
export function runRatchet({
  name,
  baselinePath,
  current,
  update,
  updateCommand,
  transfer = false,
  allowNewFiles = true,
}) {
  const baseline = readBaseline(baselinePath);

  if (!baseline) {
    if (!update) {
      console.error(
        `${name}: no baseline at ${baselinePath}; run ${updateCommand}`,
      );
      return 1;
    }
    writeBaseline(baselinePath, current);
    return 0;
  }

  const { regressions, improvements } = compareToBaseline(current, baseline);

  if (update && transfer && regressions.length > 0) {
    const blockers = transferBlockers(current, baseline, regressions, {
      allowNewFiles,
    });
    for (const blocker of blockers)
      console.error(`${name}: cannot transfer: ${blocker}`);
    if (blockers.length > 0) return 1;
    for (const regression of regressions)
      console.error(`${name}: moved ${describe(regression)}`);
    writeBaseline(baselinePath, current);
    return 0;
  }

  for (const regression of regressions)
    console.error(`${name}: new violation ${describe(regression)}`);
  if (regressions.length > 0) {
    console.error(
      `${name}: ${regressions.length} regression(s); fix them (the baseline never grows)`,
    );
    return 1;
  }

  if (update) {
    writeBaseline(baselinePath, current);
    return 0;
  }

  for (const improvement of improvements)
    console.error(`${name}: improved ${describe(improvement)}`);
  if (improvements.length > 0) {
    console.error(
      `${name}: baseline is loose; run ${updateCommand} to lock in the improvement`,
    );
    return 1;
  }

  return 0;
}
