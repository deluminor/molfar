import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listSourceFiles } from "./source-files.mjs";

const LEGAL_FILE = /(?:^|\/)(?:LICENSE|NOTICE|COPYING)[^/]*$|\.LICENSE[^/]*$/i;
const LEGAL_LINE = /Copyright|SPDX-License-Identifier|derived from|adapted from/i;
const UPSTREAM_LINK = /(?:https?:\/\/)?github\.com\/hardbeat920\/monocode\b[^\s"')]*/gi;
const NATIVE_PATH = /^(?:crates\/molfar-[^/]+\/|scripts\/[^/]*native[^/]*$|scripts\/native-(?:editor|settings)\/|docs\/native\/|\.github\/workflows\/native\.yml$)/;

const EXTERNAL_MCP_PATH = /^crates\/molfar-[^/]+\/src\/(?:[^/]+\/)*external_mcp(?:\/|\.rs$)/;
const TEST_FILE = /(?:^|\/)[^/]*tests[^/]*\.rs$/;

export function brandingViolations(file, content) {
  if (LEGAL_FILE.test(file) || file.startsWith("vendor/") || content.includes("\0")) return [];

  const externalMcpSource = EXTERNAL_MCP_PATH.test(file) && !TEST_FILE.test(file);

  return content.split("\n").flatMap((line, index) => {
    if (LEGAL_LINE.test(line)) return [];

    const upstreamBrand = /monocode|usemono/i.test(line.replace(UPSTREAM_LINK, ""));
    const namedExternalClient = externalMcpSource && /openbot/i.test(line);
    return upstreamBrand || namedExternalClient ? [`${file}:${index + 1}`] : [];
  });
}

export function checkNativeBranding(root) {
  const files = listSourceFiles(root, ["crates", "scripts", "docs/native", ".github/workflows/native.yml", "package.json"]);
  const violations = [];

  for (const file of files) {
    if (!NATIVE_PATH.test(file) && file !== "package.json") continue;

    const content = readFileSync(resolve(root, file), "utf8");
    if (file === "package.json") {
      const { scripts } = JSON.parse(content);

      for (const [name, value] of Object.entries(scripts)) {
        if (!name.startsWith("native:") || !brandingViolations(file, value).length) continue;

        const offset = content.indexOf(JSON.stringify(name));
        const line = content.slice(0, offset).split("\n").length;
        violations.push(`${file}:${line}`);
      }

      continue;
    }

    violations.push(...brandingViolations(file, content));
  }

  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const violations = checkNativeBranding(root);

  for (const violation of violations) console.error(violation);

  process.exitCode = violations.length ? 1 : 0;
}
