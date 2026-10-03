import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUpstreamPatch, readSyncState, STATE_FILE, SYNC_STATUS } from "./patch-sync.mjs";

let root;

function git(...args) {
  return execFileSync("git", args, {
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
}

function write(path, content) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function commitAll(message) {
  git("add", "-A");
  git("commit", "-qm", message);
  return git("rev-parse", "HEAD");
}

/** Upstream history on `upstream`, and a `main` that copies its tree without sharing commits. */
function setUp() {
  git("init", "-q", "-b", "upstream");
  git("config", "commit.gpgsign", "false");
  // Windows runners set core.autocrlf in the system config, which the module's
  // own git calls inherit; the fixtures compare exact line endings.
  git("config", "core.autocrlf", "false");
  write("app.txt", "one\ntwo\nthree\n");
  write("LICENSE", "Copyright (c) Nick\n");
  const base = commitAll("upstream base");

  git("switch", "-q", "--orphan", "main");
  git("checkout", "-q", base, "--", ".");
  write(STATE_FILE, `${JSON.stringify({ syncedCommit: base }, null, 2)}\n`);
  write("vatra.txt", "vatra only\n");
  commitAll("start Vatra history");

  return base;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vatra-patch-sync-"));
  writeFileSync(join(root, ".empty-gitconfig"), "");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("applyUpstreamPatch", () => {
  it("applies upstream changes and records the synced commit", () => {
    setUp();
    git("switch", "-q", "upstream");
    write("app.txt", "one\ntwo\nthree\nfour\n");
    write("new.txt", "added upstream\n");
    const head = commitAll("add four");
    git("switch", "-q", "main");

    const result = applyUpstreamPatch({ cwd: root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(result.commits).toEqual([expect.stringMatching(/ add four$/)]);
    expect(read("app.txt")).toBe("one\ntwo\nthree\nfour\n");
    expect(read("new.txt")).toBe("added upstream\n");
    expect(read("vatra.txt")).toBe("vatra only\n");
    expect(readSyncState(root).syncedCommit).toBe(head);
    expect(git("diff", "--cached", "--name-only").split("\n").sort()).toEqual(
      [STATE_FILE, "app.txt", "new.txt"].sort(),
    );
  });

  it("merges upstream edits into lines Vatra also changed elsewhere in the file", () => {
    setUp();
    write("app.txt", "ONE\ntwo\nthree\n");
    commitAll("vatra edit");
    git("switch", "-q", "upstream");
    write("app.txt", "one\ntwo\nTHREE\n");
    commitAll("upstream edit");
    git("switch", "-q", "main");

    const result = applyUpstreamPatch({ cwd: root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(read("app.txt")).toBe("ONE\ntwo\nTHREE\n");
  });

  it("leaves conflict markers and reports the paths when both sides changed the same line", () => {
    setUp();
    write("app.txt", "one\nVATRA\nthree\n");
    commitAll("vatra edit");
    git("switch", "-q", "upstream");
    write("app.txt", "one\nUPSTREAM\nthree\n");
    commitAll("upstream edit");
    git("switch", "-q", "main");

    const result = applyUpstreamPatch({ cwd: root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.CONFLICTS);
    expect(result.conflicts).toEqual(["app.txt"]);
    expect(read("app.txt")).toContain("<<<<<<<");
  });

  it("reports up to date without touching the tree", () => {
    const base = setUp();

    const result = applyUpstreamPatch({ cwd: root, target: base });

    expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("refuses to apply when upstream rewrote the synced commit away", () => {
    setUp();
    git("switch", "-q", "--orphan", "rewritten");
    write("app.txt", "rewritten\n");
    commitAll("rewritten history");
    git("switch", "-q", "-f", "main");

    const result = applyUpstreamPatch({ cwd: root, target: "rewritten" });

    expect(result.status).toBe(SYNC_STATUS.DIVERGED);
    expect(git("status", "--porcelain")).toBe("");
  });
});
