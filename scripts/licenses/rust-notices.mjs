#!/usr/bin/env node
// Usage: node scripts/licenses/rust-notices.mjs [output]   (default: public/THIRD-PARTY-NOTICES-RUST.md)
// Writes the license texts of the Rust crates linked into the desktop binary
// for the host platform. Vite copies public/ into dist, which Tauri embeds.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LICENSE_FILE, linkedPackages, renderNotices } from "./linked-crates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, process.argv[2] ?? "public/THIRD-PARTY-NOTICES-RUST.md");

const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)?.[1];
if (!host) throw new Error("Could not read the host target from `rustc -vV`");

const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--filter-platform", host], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }),
);

function licenseTexts(pkg) {
  const directory = dirname(pkg.manifest_path);
  const files = readdirSync(directory)
    .filter((name) => LICENSE_FILE.test(name) && statSync(join(directory, name)).isFile())
    .map((name) => join(directory, name));
  if (pkg.license_file) files.push(resolve(directory, pkg.license_file));

  return [...new Set(files)].sort().map((file) => readFileSync(file, "utf8"));
}

const crates = linkedPackages(metadata).map((pkg) => ({
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  texts: licenseTexts(pkg),
}));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, renderNotices(crates));
console.log(`Wrote ${crates.length} crates for ${host} to ${output}`);
