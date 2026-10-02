#!/usr/bin/env node
// Usage: node scripts/release/verify.mjs <vX.Y.Z>
// Fails unless every manifest carries the tag's version and CHANGELOG.md has
// its release notes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes } from "./changelog.mjs";
import { readVersion } from "./set-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tag = process.argv[2] ?? "";
const version = tag.replace(/^v/, "");

const read = (path) => readFileSync(join(root, path), "utf8");
const versions = {
  "package.json": readVersion(root),
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "Cargo.toml": /^\[workspace\.package\][\s\S]*?^version = "([^"]+)"/m.exec(read("Cargo.toml"))?.[1],
};

const problems = Object.entries(versions)
  .filter(([, found]) => found !== version)
  .map(([file, found]) => `${file} has ${found ?? "no version"}, expected ${version}`);
if (!/^v\d+\.\d+\.\d+$/.test(tag)) problems.unshift(`Not a release tag: ${tag || "(missing)"}`);
if (!releaseNotes(read("CHANGELOG.md"), version)) problems.push(`CHANGELOG.md has no release section for ${version}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`${tag} is consistent`);
