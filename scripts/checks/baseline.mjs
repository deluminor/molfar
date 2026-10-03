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
