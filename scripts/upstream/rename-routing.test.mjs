import { afterEach, beforeEach, expect, it } from "vitest";
import { MOVE_MAP_FILE } from "./move-map.mjs";
import { applyUpstreamPatch, PENDING_REASON, SYNC_STATUS } from "./patch-sync.mjs";
import { createTestRepo } from "./test-repo.mjs";

let repo;
beforeEach(() => { repo = createTestRepo(); });
afterEach(() => repo.dispose());

it("keeps removed upstream artwork pending instead of rewriting MOLFAR artwork", () => {
  const source = "mobile/assets/images/monocode-mark.png";
  const owned = "mobile/assets/images/molfar-mark.png";
  const base = repo.setUp({ [source]: "upstream artwork\n" });
  repo.git("rm", source);
  repo.write(owned, "MOLFAR artwork\n");
  repo.write(MOVE_MAP_FILE, JSON.stringify({ refactorBase: base, removed: { [source]: "Keep MOLFAR artwork" } }));
  repo.commitAll("replace artwork");
  repo.upstreamCommit("update artwork", { [source]: "updated upstream artwork\n" });

  const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

  expect(result.status).toBe(SYNC_STATUS.PENDING);
  expect(result.pending).toEqual([expect.objectContaining({ path: source, reason: PENDING_REASON.REMOVED })]);
  expect(repo.read(owned)).toBe("MOLFAR artwork\n");
});

it("preserves split routing when a native crate directory was renamed", () => {
  const source = "crates/monocode-core/src/large.rs";
  const owned = "crates/molfar-core/src/small.rs";
  const base = repo.setUp({ [source]: "upstream implementation\n" });
  repo.git("rm", source);
  repo.write(owned, "MOLFAR implementation\n");
  repo.write(MOVE_MAP_FILE, JSON.stringify({ refactorBase: base, splits: { [source]: { targets: [owned], notes: "Port the small module" } } }));
  repo.commitAll("split native module");
  repo.upstreamCommit("update implementation", { [source]: "updated implementation\n" });

  const result = applyUpstreamPatch({ cwd: repo.root, target: "upstream" });

  expect(result.status).toBe(SYNC_STATUS.PENDING);
  expect(result.pending).toEqual([expect.objectContaining({ path: source, reason: PENDING_REASON.SPLIT, targets: [owned] })]);
  expect(repo.read(owned)).toBe("MOLFAR implementation\n");
});
