import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MOVE_MAP_FILE } from "./move-map.mjs";
import {
  applyUpstreamPatch,
  PENDING_REASON,
  readSyncState,
  SYNC_STATUS,
} from "./patch-sync.mjs";
import { createTestRepo, numberedLines } from "./test-repo.mjs";

let repo;
let base;

beforeEach(() => {
  repo = createTestRepo();
  base = repo.setUp({
    "src/fooBar.ts": numberedLines(30),
    "src/big.ts": numberedLines(30),
    "keep.txt": "keep\n",
  });
});

afterEach(() => {
  repo.dispose();
});

function writeMoveMap(map) {
  repo.write(
    MOVE_MAP_FILE,
    `${JSON.stringify({ refactorBase: base, renames: {}, splits: {}, removed: {}, ...map }, null, 2)}\n`,
  );
}

function moveInVatra(from, to) {
  repo.git("mv", from, to);
}

describe("applyUpstreamPatch with moved paths", () => {
  it("retargets upstream edits to a path Vatra renamed and keeps Vatra's own edits", () => {
    moveInVatra("src/fooBar.ts", "src/foo-bar.ts");
    repo.write("src/foo-bar.ts", numberedLines(30, { 2: "vatra edit" }));
    writeMoveMap({ renames: { "src/fooBar.ts": "src/foo-bar.ts" } });
    repo.commitAll("vatra rename");
    repo.upstreamCommit("upstream edit", {
      "src/fooBar.ts": numberedLines(30, { 25: "upstream edit" }),
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.APPLIED);
    expect(result.retargeted).toEqual([
      { upstream: "src/fooBar.ts", vatra: "src/foo-bar.ts" },
    ]);
    expect(repo.read("src/foo-bar.ts")).toBe(
      numberedLines(30, { 2: "vatra edit", 25: "upstream edit" }),
    );
    expect(repo.exists("src/fooBar.ts")).toBe(false);
  });

  it("writes split paths as pending ports and still applies everything else", () => {
    repo.git("rm", "-q", "src/big.ts");
    repo.write("src/big/first.ts", numberedLines(15));
    writeMoveMap({
      splits: {
        "src/big.ts": {
          targets: ["src/big/first.ts"],
          notes: "lines 1-15 → first.ts",
        },
      },
    });
    repo.commitAll("vatra split");
    const head = repo.upstreamCommit("upstream edits", {
      "src/big.ts": numberedLines(30, { 5: "upstream edit" }),
      "keep.txt": "keep\nmore\n",
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.PENDING);
    expect(result.pending).toEqual([
      expect.objectContaining({
        path: "src/big.ts",
        reason: PENDING_REASON.SPLIT,
        targets: ["src/big/first.ts"],
        notes: "lines 1-15 → first.ts",
      }),
    ]);
    expect(repo.read(result.pending[0].diff)).toContain("+upstream edit");
    expect(repo.read("keep.txt")).toBe("keep\nmore\n");
    expect(readSyncState(repo.root).syncedCommit).toBe(head);
  });

  it("treats a split source that still exists as pending instead of conflicting", () => {
    repo.write("src/big.ts", numberedLines(10));
    repo.write("src/big/rest.ts", numberedLines(20));
    writeMoveMap({
      splits: {
        "src/big.ts": {
          targets: ["src/big.ts", "src/big/rest.ts"],
          notes: "tail moved",
        },
      },
    });
    repo.commitAll("vatra shrink");
    repo.upstreamCommit("upstream edit", {
      "src/big.ts": numberedLines(30, { 25: "upstream edit" }),
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.PENDING);
    expect(result.conflicts).toEqual([]);
    expect(repo.read("src/big.ts")).toBe(numberedLines(10));
  });

  it("reports removed and unmapped paths as pending without failing the sync", () => {
    repo.git("rm", "-q", "src/big.ts", "src/fooBar.ts");
    writeMoveMap({
      removed: { "src/big.ts": "dead code, nothing replaces it" },
    });
    repo.commitAll("vatra removals");
    repo.upstreamCommit("upstream edits", {
      "src/big.ts": numberedLines(30, { 1: "edit" }),
      "src/fooBar.ts": numberedLines(30, { 1: "edit" }),
    });

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.status).toBe(SYNC_STATUS.PENDING);
    expect(
      result.pending.map(({ path, reason }) => ({ path, reason })),
    ).toEqual([
      { path: "src/big.ts", reason: PENDING_REASON.REMOVED },
      { path: "src/fooBar.ts", reason: PENDING_REASON.UNMAPPED },
    ]);
  });

  it("does not guess when upstream renames a path Vatra also moved", () => {
    moveInVatra("src/fooBar.ts", "src/foo-bar.ts");
    writeMoveMap({ renames: { "src/fooBar.ts": "src/foo-bar.ts" } });
    repo.commitAll("vatra rename");
    repo.upstreamCommit(
      "upstream rename",
      { "src/fooBaz.ts": numberedLines(30) },
      ["src/fooBar.ts"],
    );

    const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(result.pending).toEqual([
      expect.objectContaining({
        path: "src/fooBar.ts",
        upstreamPath: "src/fooBaz.ts",
        vatraPath: "src/foo-bar.ts",
        reason: PENDING_REASON.MOVED_AND_RENAMED,
      }),
    ]);
    expect(repo.exists("src/foo-bar.ts")).toBe(true);
  });

  it("keeps earlier pending ports when a later range is applied on the same branch", () => {
    repo.git("rm", "-q", "src/big.ts");
    writeMoveMap({ removed: { "src/big.ts": "gone" } });
    repo.commitAll("vatra removal");
    repo.upstreamCommit("first", {
      "src/big.ts": numberedLines(30, { 1: "first" }),
    });
    const first = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });
    repo.commitAll("sync one");
    repo.upstreamCommit("second", {
      "src/big.ts": numberedLines(30, { 1: "first", 2: "second" }),
    });

    const second = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

    expect(second.pending[0].diff).not.toBe(first.pending[0].diff);
    expect(repo.exists(first.pending[0].diff)).toBe(true);
    expect(repo.exists(second.pending[0].diff)).toBe(true);
  });
});
