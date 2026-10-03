#!/usr/bin/env node
// Usage: node scripts/checks/file-size.mjs [--update]
// Fails when a source file exceeds its line limit beyond the frozen baseline.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runRatchet } from "./baseline.mjs";
import {
  oversizedFiles,
  SIZE_ROOTS,
  validateExceptions,
} from "./file-size-counts.mjs";
import { listSourceFiles } from "./source-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const exceptions = JSON.parse(
  readFileSync(join(here, "file-size.exceptions.json"), "utf8"),
);

const problems = validateExceptions(exceptions);
for (const problem of problems) console.error(`file-size: ${problem}`);
if (problems.length > 0) process.exit(1);

const files = listSourceFiles(root, SIZE_ROOTS);
const current = oversizedFiles(
  files,
  (file) => readFileSync(join(root, file), "utf8"),
  exceptions,
);

process.exit(
  runRatchet({
    name: "file-size",
    baselinePath: join(here, "file-size.baseline.json"),
    current,
    update: process.argv.includes("--update"),
    updateCommand: "npm run check:size -- --update",
  }),
);
