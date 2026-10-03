import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
import { writeNpmNotices } from "../scripts/licenses/npm-notices.mjs";

const result = await build({
  entryPoints: ["host/cli.ts"],
  outfile: "build/host/vatra-host.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  loader: { ".ps1": "text" },
  define: { "import.meta.hot": "undefined" },
  sourcemap: true,
  metafile: true,
});
await copyFile("host/provider-guard.mjs", "build/host/provider-guard.mjs");

writeNpmNotices({
  cwd: process.cwd(),
  metafile: result.metafile,
  output: "build/host/THIRD-PARTY-NOTICES.md",
  title: "Vatra Host dependency licenses",
  intro: "The Vatra Host bundle (host.mjs) includes the following npm packages.",
});
