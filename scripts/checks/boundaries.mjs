#!/usr/bin/env node
// Usage: node scripts/checks/boundaries.mjs [--update]
// Fails on imports that break the layer direction beyond the frozen baseline.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addCount, runRatchet } from "./baseline.mjs";
import { importSpecifiers, resolveSpecifier } from "./import-specifiers.mjs";
import { importViolation } from "./layer-rules.mjs";
import { listSourceFiles } from "./source-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const SCRIPT_FILE = /\.(ts|tsx|mts)$/;

const current = {};
for (const file of listSourceFiles(root, ["src", "host"]).filter((path) =>
  SCRIPT_FILE.test(path),
)) {
  const source = readFileSync(join(root, file), "utf8");

  for (const specifier of importSpecifiers(source)) {
    const target = resolveSpecifier(file, specifier);
    const violation = target && importViolation(file, target);
    if (violation) addCount(current, file, violation);
  }
}

process.exit(
  runRatchet({
    name: "boundaries",
    baselinePath: join(here, "boundaries.baseline.json"),
    current,
    update: process.argv.includes("--update"),
    updateCommand: "npm run check:boundaries -- --update",
  }),
);
