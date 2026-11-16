import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MOVE_MAP_FILE,
  readMoveMap,
  regenerateMoveMap,
  validateMoveMap,
  writeMoveMap,
} from "./move-map.mjs";
import { createTestRepo, numberedLines } from "./test-repo.mjs";

let repo;
let refactorBase;

const bigLines = (count) => numberedLines(count).replaceAll("line", "big");

beforeEach(() => {
  repo = createTestRepo();
  repo.setUp({
    "src/fooBar.ts": numberedLines(30),
    "src/big.ts": bigLines(30),
    "src/dead.ts": "dead\n",
  });
  refactorBase = repo.git("rev-parse", "HEAD");
  writeMoveMap(repo.root, {
    refactorBase,
    renames: {},
    splits: {},
    removed: {},
  });
  repo.commitAll("add move map");
});

afterEach(() => {
  repo.dispose();
});

function refactor() {
  repo.git("mv", "src/fooBar.ts", "src/foo-bar.ts");
  repo.git("rm", "-q", "src/big.ts", "src/dead.ts");
  repo.write("src/big/first.ts", bigLines(15));
  repo.write("src/big/second.ts", bigLines(15));
}

describe("move map", () => {
  it("is valid when nothing moved", () => {
    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([]);
  });

  it("reports renames, splits and removals the map does not cover", () => {
    refactor();
    repo.commitAll("refactor");

    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([
      "rename src/fooBar.ts -> src/foo-bar.ts is missing; run node scripts/upstream/moves.mjs",
      "src/big.ts was removed since refactorBase but is not in renames, splits or removed",
      "src/dead.ts was removed since refactorBase but is not in renames, splits or removed",
    ]);
  });

  it("is valid once renames are regenerated and splits and removals are described", () => {
    refactor();
    const map = regenerateMoveMap(repo.root, {
      ...readMoveMap(repo.root),
      splits: {
        "src/big.ts": {
          targets: ["src/big/first.ts", "src/big/second.ts"],
          notes: "halves",
        },
      },
      removed: { "src/dead.ts": "unused" },
    });
    writeMoveMap(repo.root, map);
    repo.commitAll("refactor");

    expect(map.renames).toEqual({ "src/fooBar.ts": "src/foo-bar.ts" });
    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([]);
  });

  it("keeps recorded renames whose target exists, even for paths unknown at refactorBase", () => {
    repo.write("src/later-upstream.ts", "later\n");
    repo.git("add", "src/later-upstream.ts");

    const map = regenerateMoveMap(repo.root, {
      ...readMoveMap(repo.root),
      renames: {
        "src/laterUpstream.ts": "src/later-upstream.ts",
        "src/stale.ts": "src/missing.ts",
      },
    });

    expect(map.renames).toEqual({
      "src/laterUpstream.ts": "src/later-upstream.ts",
    });
  });

  it("reports targets that do not exist and splits without notes", () => {
    writeMoveMap(repo.root, {
      ...readMoveMap(repo.root),
      renames: { "src/gone.ts": "src/missing.ts" },
      splits: { "src/big.ts": { targets: ["src/big/none.ts"], notes: "" } },
    });
    repo.commitAll("broken map");

    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([
      "rename target src/missing.ts (from src/gone.ts) does not exist",
      "split src/big.ts has no notes",
      "split target src/big/none.ts (from src/big.ts) does not exist",
    ]);
  });

  it("reports extraction targets that do not exist and extractions without names", () => {
    writeMoveMap(repo.root, {
      ...readMoveMap(repo.root),
      extractions: {
        "src/big.ts": [
          { names: ["A"], target: "src/missing.ts" },
          { names: [], target: "src/fooBar.ts" },
        ],
      },
    });
    repo.commitAll("broken extractions");

    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([
      "extraction target src/missing.ts (from src/big.ts) does not exist",
      "extraction from src/big.ts lists no names",
    ]);
  });

  it("requires refactorBase", () => {
    repo.write(MOVE_MAP_FILE, "{}\n");

    expect(validateMoveMap(repo.root, readMoveMap(repo.root))).toEqual([
      `${MOVE_MAP_FILE}: refactorBase is not set`,
    ]);
  });
});
