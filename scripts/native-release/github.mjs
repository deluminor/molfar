import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { previewVersion } from "../package-native-support.mjs";
import { nativeTargets } from "../native-release.mjs";

export function nativeTag(version) {
  previewVersion(version);
  return `native-v${version}`;
}

export function expectedPackages(version) {
  const { base, sequence } = previewVersion(version);
  return new Map([
    [`MolfarNative_${version}_aarch64.app.tar.gz`, "darwin-aarch64-app"],
    [`MolfarNative_${version}_x64.app.tar.gz`, "darwin-x86_64-app"],
    [`MolfarNative_${version}_aarch64.dmg`, null],
    [`MolfarNative_${version}_x64.dmg`, null],
    [`MolfarNative_${version}_x64-setup.exe`, "windows-x86_64-nsis"],
    [`MolfarNative_${version}_amd64.AppImage`, "linux-x86_64-appimage"],
    [`molfar-native_${version}_amd64.deb`, "linux-x86_64-deb"],
    [`molfar-native-${base}-0.preview.${sequence}.x86_64.rpm`, "linux-x86_64-rpm"],
  ]);
}

export async function collectNativePackages(directory, version, distribution) {
  if (!["public", "validation"].includes(distribution))
    throw new Error("Expected public or validation distribution");
  const tag = nativeTag(version);
  const expected = expectedPackages(version);
  const found = new Set();
  const targets = new Set();
  const sums = [];
  for (const name of (await readdir(directory)).filter((file) => /^artifacts-.*\.json$/.test(file))) {
    const records = JSON.parse(await readFile(join(directory, name), "utf8"));
    if (!Array.isArray(records)) throw new Error(`Invalid metadata: ${name}`);
    for (const record of records) {
      const { filename, target } = record;
      if (!expected.has(filename) || expected.get(filename) !== target)
        throw new Error(`Unexpected native package: ${filename}`);
      if (record.distribution !== distribution)
        throw new Error(`Distribution mismatch: ${filename}`);
      if (found.has(filename)) throw new Error(`Duplicate native package: ${filename}`);
      const file = join(directory, filename);
      const stat = await lstat(file);
      if (!stat.isFile() || !stat.size) throw new Error(`Invalid package file: ${filename}`);
      found.add(filename);
      if (target) targets.add(target);
      sums.push(`${createHash("sha256").update(await readFile(file)).digest("hex")}  ${filename}`);
    }
  }
  if (found.size !== expected.size || targets.size !== nativeTargets.length)
    throw new Error("Incomplete native package set");
  const checksum = "SHA256SUMS.txt";
  await writeFile(join(directory, checksum), `${sums.sort().join("\n")}\n`);
  const files = [...found].sort().concat(checksum);
  await writeFile(join(directory, "github-release.json"), JSON.stringify({
    tag, version, distribution, files, app_id: "com.molfar.native", updater: false,
  }, null, 2));
  return { tag, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, version, distribution] = process.argv.slice(2);
  await collectNativePackages(directory, version, distribution);
}
