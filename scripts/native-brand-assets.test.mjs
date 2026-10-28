import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { linuxTree } from "./package-native-support.mjs";

test("generated native icons retain the required PNG dimensions", async () => {
  for (const [file, size] of [["molfar.png", 1024], ["molfar-native.png", 256]]) {
    const bytes = await readFile(new URL(`../crates/molfar-gpui/assets/${file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test("Linux packages expose the MOLFAR native launcher, identity and generated icon", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "molfar-linux-package-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, "binary");
  await writeFile(binary, "native binary fixture");
  const tree = join(directory, "package");
  await linuxTree(tree, binary, "deb");
  const launcher = await readFile(join(tree, "usr/bin/molfar-native"), "utf8");
  assert.ok(launcher.includes("/usr/lib/molfar-native/molfar-native"));
  const desktop = await readFile(join(tree, "usr/share/applications/molfar-native.desktop"), "utf8");
  assert.ok(desktop.includes("Name=MOLFAR Native"));
  assert.ok(desktop.includes("StartupWMClass=com.molfar.native"));
  const metadata = JSON.parse(await readFile(join(tree, "usr/lib/molfar-native/native-install.json"), "utf8"));
  assert.equal(metadata.app_id, "com.molfar.native");
  const icon = await readFile(join(tree, "usr/share/icons/hicolor/256x256/apps/molfar-native.png"));
  assert.equal(icon.readUInt32BE(16), 256);
});
