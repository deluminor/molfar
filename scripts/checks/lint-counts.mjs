import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { addCount } from "./baseline.mjs";

const COUNTED_SEVERITIES = new Set(["error", "warning", "fatal"]);

function runBiome(cwd) {
  // The package's Node launcher, not `.bin/biome`, so Windows runners need no `.cmd` shim.
  const biome = join(cwd, "node_modules", "@biomejs", "biome", "bin", "biome");
  const args = [
    biome,
    "lint",
    "--reporter=json",
    "--max-diagnostics=none",
    "--colors=off",
  ];

  try {
    return execFileSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
}

/** Counts Biome errors and warnings per file and rule; infos are suggestions and are not counted. */
export function lintCounts(report) {
  const counts = {};

  for (const diagnostic of report.diagnostics ?? []) {
    if (!COUNTED_SEVERITIES.has(diagnostic.severity)) continue;
    const file = diagnostic.location?.path ?? "(configuration)";
    addCount(counts, file, diagnostic.category);
  }

  return counts;
}

export function collectLintCounts(cwd) {
  return lintCounts(JSON.parse(runBiome(cwd)));
}
