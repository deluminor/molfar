import { execFileSync } from "node:child_process";

export function git(cwd, args, input) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function isAncestor(cwd, ancestor, descendant) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

export function lines(output) {
  return output.split("\n").filter(Boolean);
}

export function existsInIndex(cwd, path) {
  return git(cwd, ["ls-files", "--", path]).trim() !== "";
}

export function unmergedPaths(cwd) {
  return lines(git(cwd, ["diff", "--name-only", "--diff-filter=U"]));
}
