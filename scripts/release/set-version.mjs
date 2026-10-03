import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function replaceFirst(path, pattern, replacement) {
  const text = readFileSync(path, "utf8");
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`failed to update ${path}`);

  writeFileSync(path, next);
}

/** Writes `version` into every manifest and lockfile that carries the app version. */
export function setVersion(root, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Not a release version: ${version}`);

  replaceFirst(join(root, "package.json"), /("version": ")[^"]+(")/, `$1${version}$2`);
  // Windows checkouts may use CRLF, so line breaks in these patterns are `\r?\n`.
  // The lockfile carries the version twice: once at the top and once on the
  // root package. Missing them left npm's lockfile claiming 0.1.0 sixteen
  // releases later. The second pattern is anchored on `packages` because the
  // top-level object repeats the same name/version pair.
  replaceFirst(
    join(root, "package-lock.json"),
    /^(\{\r?\n\s*"name": "molfar-desktop",\r?\n\s*"version": ")[^"]+(")/,
    `$1${version}$2`,
  );
  replaceFirst(
    join(root, "package-lock.json"),
    /("packages": \{\r?\n\s*"": \{\r?\n\s*"name": "molfar-desktop",\r?\n\s*"version": ")[^"]+(")/,
    `$1${version}$2`,
  );
  replaceFirst(join(root, "Cargo.toml"), /^(version = ")[^"]+(")/m, `$1${version}$2`);
  replaceFirst(join(root, "src-tauri/tauri.conf.json"), /("version": ")[^"]+(")/, `$1${version}$2`);
  replaceFirst(join(root, "Cargo.lock"), /(name = "molfar"\r?\nversion = ")[^"]+(")/, `$1${version}$2`);
}

/** The app version every manifest must agree on. */
export function readVersion(root) {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}
