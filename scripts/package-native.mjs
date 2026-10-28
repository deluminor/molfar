// Package a prebuilt native executable. Never invokes the Tauri app build or
// writes production release/update paths.
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  root,
  previewVersion,
  run,
  notices,
  linuxTree,
} from "./package-native-support.mjs";
import { packageMacos } from "./package-native-macos.mjs";

export async function packageNative({
  kind,
  binary,
  out,
  version,
  arch = "x86_64",
}) {
  const parsed = previewVersion(version);
  binary = resolve(binary);
  out = resolve(out);
  const embedded = run(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).stdout.trim();
  if (embedded !== `MOLFAR Native ${version}`)
    throw new Error(`Native executable version does not match ${version}`);
  await mkdir(out, { recursive: true });
  const work = join(out, "work");
  await mkdir(work, { recursive: true });
  const artifacts = [];
  const add = (filename, target = null) => {
    artifacts.push({ filename, target });
    return join(out, filename);
  };
  if (kind === "macos") {
    await packageMacos({ binary, version, arch, work, add });
  } else if (kind === "linux") {
    const debRoot = join(work, "deb");
    await linuxTree(debRoot, binary, "deb");
    await mkdir(join(debRoot, "DEBIAN"));
    await writeFile(
      join(debRoot, "DEBIAN/control"),
      `Package: molfar-native\nVersion: ${version.replace("-preview.", "~preview.")}\nArchitecture: amd64\nMaintainer: MOLFAR maintainers\nSection: devel\nPriority: optional\nDepends: libasound2, libfontconfig1, libfreetype6, libxkbcommon0, libxkbcommon-x11-0, libwayland-client0, libx11-xcb1, libxcb1, libxcb-shape0, libxcb-xfixes0, libxcb-randr0, libegl1, libvulkan1, libdbus-1-3, pkexec | policykit-1\nDescription: MOLFAR Native experimental preview\n`,
    );
    run("dpkg-deb", [
      "--build",
      "--root-owner-group",
      debRoot,
      add(`molfar-native_${version}_amd64.deb`, "linux-x86_64-deb"),
    ]);
    const appDir = join(work, "MolfarNative.AppDir");
    const { desktop } = await linuxTree(appDir, binary, "appimage");
    await writeFile(
      join(appDir, "molfar-native.desktop"),
      desktop.replace("Exec=molfar-native %F", "Exec=molfar-native %F"),
    );
    await cp(
      join(root, "crates/molfar-gpui/assets/molfar-native.png"),
      join(appDir, "molfar-native.png"),
    );
    await writeFile(
      join(appDir, "AppRun"),
      '#!/bin/sh\nexec "$APPDIR/usr/lib/molfar-native/molfar-native" "$@"\n',
      { mode: 0o755 },
    );
    run(
      process.env.APPIMAGETOOL || "appimagetool",
      [
        appDir,
        add(
          `MolfarNative_${version}_amd64.AppImage`,
          "linux-x86_64-appimage",
        ),
      ],
      {
        env: { ...process.env, ARCH: "x86_64", APPIMAGE_EXTRACT_AND_RUN: "1" },
      },
    );
  } else if (kind === "rpm") {
    const top = join(work, "rpmbuild");
    for (const name of ["BUILD", "RPMS", "SOURCES", "SPECS", "SRPMS"])
      await mkdir(join(top, name), { recursive: true });
    const tree = join(top, "SOURCES/tree");
    await linuxTree(tree, binary, "rpm");
    const spec = join(top, "SPECS/molfar-native.spec");
    await writeFile(
      spec,
      `Name: molfar-native\nVersion: ${parsed.base}\nRelease: 0.preview.${parsed.sequence}%{?dist}\nSummary: MOLFAR Native experimental preview\nLicense: MIT AND Apache-2.0\nBuildArch: x86_64\nRequires: polkit\n%description\nMOLFAR Native experimental preview.\n%install\nmkdir -p %{buildroot}\ncp -a %{_sourcedir}/tree/. %{buildroot}/\n%files\n/usr/bin/molfar-native\n/usr/lib/molfar-native\n/usr/share/applications/molfar-native.desktop\n/usr/share/icons/hicolor/256x256/apps/molfar-native.png\n`,
    );
    run("rpmbuild", [
      "--define",
      `_topdir ${top}`,
      "--define",
      "_build_id_links none",
      "-bb",
      spec,
    ]);
    const rpms = (await readdir(join(top, "RPMS/x86_64"))).filter(
      (n) =>
        n.endsWith(".rpm") &&
        !n.includes("debuginfo") &&
        !n.includes("debugsource"),
    );
    if (rpms.length !== 1) throw new Error("Expected exactly one native rpm");
    await cp(
      join(top, "RPMS/x86_64", rpms[0]),
      add(rpms[0], "linux-x86_64-rpm"),
    );
  } else if (kind === "windows") {
    const stage = join(work, "windows");
    await mkdir(stage);
    await cp(binary, join(stage, "molfar-native.exe"));
    await writeFile(
      join(stage, "native-install.json"),
      JSON.stringify({ app_id: "com.molfar.native", kind: "nsis" }),
    );
    await notices(join(stage, "licenses"));
    const installer = add(
      `MolfarNative_${version}_x64-setup.exe`,
      "windows-x86_64-nsis",
    );
    const quote = (value) =>
      value.replaceAll("$", "$$").replaceAll('"', '$\\"');
    const template = await readFile(
      join(root, "scripts/native-installer.nsi"),
      "utf8",
    );
    const script = template
      .replaceAll("@STAGE@", quote(stage))
      .replaceAll("@OUTFILE@", quote(installer))
      .replaceAll("@ICON@", quote(join(root, "src-tauri/icons/icon.ico")))
      .replaceAll("@VERSION@", version)
      .replaceAll("@WINDOWS_VERSION@", parsed.windows);
    const nsi = join(work, "installer.nsi");
    await writeFile(nsi, script);
    run("makensis", [nsi]);
  } else throw new Error(`Unknown native package kind: ${kind}`);
  await writeFile(
    join(out, `artifacts-${kind}-${arch}.json`),
    JSON.stringify(artifacts, null, 2),
  );
  return artifacts;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [kind, binary, out, arch] = process.argv.slice(2);
  await packageNative({
    kind,
    binary,
    out,
    arch,
    version: process.env.MOLFAR_NATIVE_VERSION,
  });
}
