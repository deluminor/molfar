// Shared steps for scripts/package-native.mjs, split out to keep each module small.
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, writeFile, chmod, lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export function previewVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-preview\.(0|[1-9]\d*)$/.exec(
      version,
    );
  if (!match || match.slice(1).some((n) => Number(n) > 65535))
    throw new Error(
      "Expected a native preview version such as 0.16.0-preview.1",
    );
  return {
    version,
    base: match.slice(1, 4).join("."),
    sequence: match[4],
    windows: match.slice(1).join("."),
  };
}
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} failed (${result.status})`);
    error.status = result.status;
    throw error;
  }
  return result;
}

// stapler's EX_NOHOST (68) can indicate a ticket-service/network failure.
// Retry it boundedly; every other status still stops packaging immediately.
export async function runStapler(
  action,
  file,
  { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      run("xcrun", ["stapler", action, file]);
      return;
    } catch (error) {
      if (error.status !== 68 || attempt === 5) throw error;
      const delay = attempt * 10_000;
      console.warn(
        `Apple ticket service unavailable during ${action}; retrying in ${delay / 1000}s (${attempt}/5)`,
      );
      await wait(delay);
    }
  }
}

// Count apparent bytes, including sparse files, without following the
// Applications shortcut or any other symlinks outside the staging tree.
export async function logicalBytes(path) {
  const info = await lstat(path);
  if (!info.isDirectory()) return info.size;
  const children = await Promise.all(
    (await readdir(path)).map((name) => logicalBytes(join(path, name))),
  );
  return info.size + children.reduce((sum, size) => sum + size, 0);
}
export async function notices(directory) {
  await mkdir(directory, { recursive: true });
  for (const file of [
    "LICENSE",
    "NOTICE",
    "docs/native/LICENSE-GPUI-APACHE",
    "docs/native/LICENSE-MERMAID-MIT",
    "crates/monocode-gpui/assets/hugeicons.LICENSE",
    "crates/monocode-gpui/assets/dark-plus.LICENSE",
    "crates/monocode-gpui/assets/native-editor.LICENSE.txt",
  ]) {
    await cp(join(root, file), join(directory, file.split("/").at(-1)));
  }
  await cp(
    join(root, "crates/monocode-gpui/assets/material/LICENSE"),
    join(directory, "material-icons.LICENSE"),
  );
}
export async function linuxTree(directory, binary, kind) {
  const app = join(directory, "usr/lib/monocode-native");
  await mkdir(app, { recursive: true });
  await cp(binary, join(app, "monocode-gpui"));
  await chmod(join(app, "monocode-gpui"), 0o755);
  await writeFile(
    join(app, "native-install.json"),
    JSON.stringify({ app_id: "dev.usemono.gpui", kind }),
  );
  await notices(join(app, "licenses"));
  await mkdir(join(directory, "usr/bin"), { recursive: true });
  await writeFile(
    join(directory, "usr/bin/monocode-native"),
    '#!/bin/sh\nexec /usr/lib/monocode-native/monocode-gpui "$@"\n',
    { mode: 0o755 },
  );
  await mkdir(join(directory, "usr/share/applications"), { recursive: true });
  const desktop =
    "[Desktop Entry]\nType=Application\nName=Monocode Native\nExec=monocode-native %F\nIcon=monocode-native\nCategories=Development;\nTerminal=false\nStartupWMClass=dev.usemono.gpui\n";
  await writeFile(
    join(directory, "usr/share/applications/monocode-native.desktop"),
    desktop,
  );
  const icons = join(directory, "usr/share/icons/hicolor/256x256/apps");
  await mkdir(icons, { recursive: true });
  await cp(
    join(root, "public/monocode.png"),
    join(icons, "monocode-native.png"),
  );
  return { app, desktop };
}
