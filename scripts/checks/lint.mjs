#!/usr/bin/env node
// Usage: node scripts/checks/lint.mjs [--update]
// Runs Biome and fails on lint findings beyond the frozen baseline.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runRatchet } from "./baseline.mjs";
import { collectLintCounts } from "./lint-counts.mjs";

const here = dirname(fileURLToPath(import.meta.url));

process.exit(
  runRatchet({
    name: "lint",
    baselinePath: join(here, "lint.baseline.json"),
    current: collectLintCounts(join(here, "../..")),
    update: process.argv.includes("--update"),
    updateCommand: "npm run lint -- --update",
  }),
);
