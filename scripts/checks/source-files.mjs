import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Tracked and new (not ignored) files under `roots` that exist on disk, repo-relative. */
export function listSourceFiles(cwd, roots) {
  const output = execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...roots,
    ],
    { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );

  const files = new Set(output.split("\n").filter(Boolean));
  return [...files].filter((file) => existsSync(join(cwd, file))).sort();
}
