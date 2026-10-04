import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyUpstreamPatch,
  readSyncState,
  STATE_FILE,
  SYNC_STATUS,
} from "./patch-sync.mjs";
import { createTestRepo } from "./test-repo.mjs";

let repo;

beforeEach(() => {
  repo = createTestRepo();
});

afterEach(() => {
  repo.dispose();
});

describe("applyUpstreamPatch", () => {
  it("applies upstream changes and records the synced commit", () => {
    repo.setUp();
    const head = repo.upstreamCommit("add four", {
      "app.txt": "one\ntwo\nthree\nfour\n",
      "new.txt": "added upstream\n",
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(result.commits).toEqual([expect.stringMatching(/ add four$/)]);
    expect(result.added).toEqual(["new.txt"]);
    expect(repo.read("app.txt")).toBe("one\ntwo\nthree\nfour\n");
    expect(repo.read("new.txt")).toBe("added upstream\n");
    expect(repo.read("molfar.txt")).toBe("molfar only\n");
    expect(readSyncState(repo.root).syncedCommit).toBe(head);
    expect(
      repo.git("diff", "--cached", "--name-only").split("\n").sort(),
    ).toEqual([STATE_FILE, "app.txt", "new.txt"].sort());
  });

  it("merges upstream edits into lines MOLFAR also changed elsewhere in the file", () => {
    repo.setUp();
    repo.write("app.txt", "ONE\ntwo\nthree\n");
    repo.commitAll("molfar edit");
    repo.upstreamCommit("upstream edit", { "app.txt": "one\ntwo\nTHREE\n" });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(repo.read("app.txt")).toBe("ONE\ntwo\nTHREE\n");
  });

  it("leaves conflict markers and reports the paths when both sides changed the same line", () => {
    repo.setUp();
    repo.write("app.txt", "one\nMOLFAR\nthree\n");
    repo.commitAll("molfar edit");
    repo.upstreamCommit("upstream edit", {
      "app.txt": "one\nUPSTREAM\nthree\n",
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.CONFLICTS);
    expect(result.conflicts).toEqual(["app.txt"]);
    expect(repo.read("app.txt")).toContain("<<<<<<<");
  });

  it("keeps applying other paths after one path conflicts", () => {
    repo.setUp({ "a.txt": "one\ntwo\n", "b.txt": "one\ntwo\n" });
    repo.write("a.txt", "one\nMOLFAR\n");
    repo.commitAll("molfar edit");
    repo.upstreamCommit("upstream edits", {
      "a.txt": "one\nUPSTREAM\n",
      "b.txt": "one\ntwo\nthree\n",
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.CONFLICTS);
    expect(result.conflicts).toEqual(["a.txt"]);
    expect(repo.read("b.txt")).toBe("one\ntwo\nthree\n");
  });

  it("applies upstream renames of paths MOLFAR kept in place", () => {
    repo.setUp({ "old.txt": "one\ntwo\nthree\nfour\nfive\n" });
    repo.upstreamCommit(
      "rename",
      { "new.txt": "one\ntwo\nthree\nfour\nfive\n" },
      ["old.txt"],
    );

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(repo.exists("old.txt")).toBe(false);
    expect(repo.read("new.txt")).toBe("one\ntwo\nthree\nfour\nfive\n");
  });

  it("reports up to date without touching the tree", () => {
    const base = repo.setUp();

    const result = applyUpstreamPatch({ cwd: repo.root, target: base });

    expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("refuses to apply when upstream rewrote the synced commit away", () => {
    repo.setUp();
    repo.git("switch", "-q", "--orphan", "rewritten");
    repo.write("app.txt", "rewritten\n");
    repo.commitAll("rewritten history");
    repo.git("switch", "-q", "-f", "main");

    const result = applyUpstreamPatch({ cwd: repo.root, target: "rewritten" });

    expect(result.status).toBe(SYNC_STATUS.DIVERGED);
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});
