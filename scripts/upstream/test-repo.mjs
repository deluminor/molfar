import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STATE_FILE } from "./patch-sync.mjs";

/**
 * A throwaway repository with upstream history on `upstream` and a `main` that copies its tree
 * without sharing commits, mirroring how Vatra relates to MonoCode.
 */
export function createTestRepo() {
  const root = mkdtempSync(join(tmpdir(), "vatra-patch-sync-"));
  writeFileSync(join(root, ".empty-gitconfig"), "");

  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: join(root, ".empty-gitconfig"),
        GIT_AUTHOR_NAME: "Owner",
        GIT_AUTHOR_EMAIL: "owner@example.invalid",
        GIT_COMMITTER_NAME: "Owner",
        GIT_COMMITTER_EMAIL: "owner@example.invalid",
      },
    }).trim();

  const write = (path, content) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };

  const commitAll = (message) => {
    git("add", "-A");
    git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };

  /** Seeds both histories with `files`; returns the upstream base commit. */
  const setUp = (files = { "app.txt": "one\ntwo\nthree\n", LICENSE: "Copyright (c) Nick\n" }) => {
    git("init", "-q", "-b", "upstream");
    git("config", "commit.gpgsign", "false");
    // Windows runners set core.autocrlf in the system config, which the module's
    // own git calls inherit; the fixtures compare exact line endings.
    git("config", "core.autocrlf", "false");
    for (const [path, content] of Object.entries(files)) write(path, content);
    const base = commitAll("upstream base");

    git("switch", "-q", "--orphan", "main");
    git("checkout", "-q", base, "--", ".");
    write(STATE_FILE, `${JSON.stringify({ syncedCommit: base }, null, 2)}\n`);
    write("vatra.txt", "vatra only\n");
    commitAll("start Vatra history");

    return base;
  };

  /** Commits `files` on `upstream` and switches back to `main`. */
  const upstreamCommit = (message, files, removed = []) => {
    git("switch", "-q", "upstream");
    for (const [path, content] of Object.entries(files)) write(path, content);
    for (const path of removed) git("rm", "-q", path);
    const head = commitAll(message);
    git("switch", "-q", "main");
    return head;
  };

  return {
    root,
    git,
    write,
    commitAll,
    setUp,
    upstreamCommit,
    read: (path) => readFileSync(join(root, path), "utf8"),
    exists: (path) => existsSync(join(root, path)),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function numberedLines(count, edits = {}) {
  return Array.from({ length: count }, (_, index) => edits[index + 1] ?? `line ${index + 1}`).join("\n") + "\n";
}
