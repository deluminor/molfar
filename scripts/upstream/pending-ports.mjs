import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PENDING_DIR = ".upstream-pending";

/**
 * Writes each pending upstream diff under `.upstream-pending/<from>..<to>/` so a later run on the same
 * branch never overwrites ports that are still open. Returns the entries without patch bodies.
 */
export function writePendingPorts(cwd, from, to, pending) {
  const runDir = join(PENDING_DIR, `${from.slice(0, 12)}..${to.slice(0, 12)}`);

  const entries = pending.map(({ patch, ...entry }) => {
    const diff = join(runDir, `${entry.path}.diff`);
    mkdirSync(dirname(join(cwd, diff)), { recursive: true });
    writeFileSync(join(cwd, diff), patch);
    return { ...entry, diff };
  });

  if (entries.length > 0) {
    writeFileSync(join(cwd, runDir, "manifest.json"), `${JSON.stringify({ from, to, pending: entries }, null, 2)}\n`);
  }

  return entries;
}
