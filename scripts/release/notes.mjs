#!/usr/bin/env node
// Usage: node scripts/release/notes.mjs <X.Y.Z> — prints that release's CHANGELOG notes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes } from "./changelog.mjs";

const version = (process.argv[2] ?? "").replace(/^v/, "");
const changelog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../CHANGELOG.md"), "utf8");
const notes = version ? releaseNotes(changelog, version) : null;

if (!notes) {
  console.error(`CHANGELOG.md has no release section for ${version || "(missing version)"}`);
  process.exit(1);
}
process.stdout.write(`${notes}\n`);
