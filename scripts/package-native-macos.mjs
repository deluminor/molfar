// macOS app bundle, notarization and DMG steps of scripts/package-native.mjs.
import { mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { run, runStapler, logicalBytes } from "./package-native-support.mjs";

export async function packageMacos({ binary, version, arch, work, add }) {
  const expectedArch = arch === "aarch64" ? "arm64" : "x86_64";
  const actualArch = run("lipo", ["-archs", binary], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).stdout.trim();
  if (actualArch !== expectedArch)
    throw new Error(`Expected ${expectedArch}, found ${actualArch}`);
  run(
    "bash",
    [
      "scripts/bundle-native-macos.sh",
      "release",
      dirname(dirname(binary)),
      version,
      "monocode-data",
    ],
    {
      env: {
        ...process.env,
        MONOCODE_NATIVE_SIGNING_IDENTITY:
          process.env.APPLE_SIGNING_IDENTITY || "",
      },
    },
  );
  const app = join(dirname(binary), "Monocode Native.app");
  if (
    !process.env.APPLE_SIGNING_IDENTITY ||
    process.env.APPLE_SIGNING_IDENTITY === "-"
  )
    throw new Error("Public previews require a Developer ID signing identity");
  const submit = async (file, staple) => {
    const result = run(
      "xcrun",
      [
        "notarytool",
        "submit",
        file,
        "--key",
        process.env.APPLE_API_KEY_PATH,
        "--key-id",
        process.env.APPLE_API_KEY,
        "--issuer",
        process.env.APPLE_API_ISSUER,
        "--wait",
        "--output-format",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
    if (JSON.parse(result.stdout).status !== "Accepted")
      throw new Error(
        `Apple did not accept ${basename(file)} for notarization`,
      );
    if (staple) {
      await runStapler("staple", staple);
      await runStapler("validate", staple);
    }
  };
  const zip = join(work, "notarize.zip");
  run("ditto", ["-c", "-k", "--keepParent", app, zip]);
  await submit(zip, app);
  run("codesign", ["--verify", "--deep", "--strict", app]);
  run("spctl", ["--assess", "--type", "execute", app]);
  const name = arch === "aarch64" ? "aarch64" : "x64";
  const archive = add(
    `MonocodeNative_${version}_${name}.app.tar.gz`,
    `darwin-${arch}-app`,
  );
  run("tar", ["-czf", archive, "-C", dirname(app), "Monocode Native.app"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const imageRoot = join(work, "dmg");
  await mkdir(imageRoot);
  run("ditto", [app, join(imageRoot, "Monocode Native.app")]);
  run("ln", ["-s", "/Applications", join(imageRoot, "Applications")]);
  const dmg = add(`MonocodeNative_${version}_${name}.dmg`);
  const imageSizeMiB =
    Math.ceil((await logicalBytes(imageRoot)) / 1048576) + 64;
  run("hdiutil", [
    "create",
    "-volname",
    "Monocode Native",
    "-srcfolder",
    imageRoot,
    "-ov",
    "-format",
    "UDZO",
    "-fs",
    "HFS+",
    "-size",
    `${imageSizeMiB}m`,
    dmg,
  ]);
  run("codesign", [
    "--sign",
    process.env.APPLE_SIGNING_IDENTITY,
    "--timestamp",
    dmg,
  ]);
  await submit(dmg, dmg);
}
