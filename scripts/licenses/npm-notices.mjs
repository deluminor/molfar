import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bundledPackageRoots } from "./bundled-npm.mjs";
import { borrowRepositoryLicenses, LICENSE_FILE, renderNotices } from "./render-notices.mjs";

function declaredLicense(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license?.type) return manifest.license.type;
  return manifest.licenses?.map((license) => license.type ?? license).join(" OR ") ?? null;
}

function repositoryUrl(manifest) {
  return typeof manifest.repository === "string" ? manifest.repository : (manifest.repository?.url ?? null);
}

function licenseTexts(directory) {
  return readdirSync(directory)
    .filter((name) => LICENSE_FILE.test(name) && statSync(join(directory, name)).isFile())
    .sort()
    .map((name) => readFileSync(join(directory, name), "utf8"));
}

/** Writes the licenses of the npm packages an esbuild metafile bundled, and returns their count. */
export function writeNpmNotices({ cwd, metafile, output, title, intro }) {
  const packages = bundledPackageRoots(Object.keys(metafile.inputs)).map((root) => {
    const directory = join(cwd, root);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));

    return {
      name: manifest.name,
      version: manifest.version,
      license: declaredLicense(manifest),
      repository: repositoryUrl(manifest),
      texts: licenseTexts(directory),
    };
  });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    renderNotices(borrowRepositoryLicenses(packages), {
      title,
      intro,
      sourceUrl: (pkg) => `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
    }),
  );

  return packages.length;
}
