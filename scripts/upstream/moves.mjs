#!/usr/bin/env node
// Usage:
//   node scripts/upstream/moves.mjs            regenerate `renames` in .github/upstream-moves.json
//   node scripts/upstream/moves.mjs --check    fail when the move map does not cover the tree
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOVE_MAP_FILE, readMoveMap, regenerateMoveMap, validateMoveMap, writeMoveMap } from "./move-map.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const map = readMoveMap(root);

if (process.argv.includes("--check")) {
  const problems = validateMoveMap(root, map);
  for (const problem of problems) console.error(`upstream-moves: ${problem}`);
  process.exit(problems.length > 0 ? 1 : 0);
}

if (!map.refactorBase) {
  console.error(`${MOVE_MAP_FILE}: set refactorBase before generating renames`);
  process.exit(1);
}

writeMoveMap(root, regenerateMoveMap(root, map));
