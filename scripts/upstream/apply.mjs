#!/usr/bin/env node
// Usage: node scripts/upstream/apply.mjs [target-ref]   (default: upstream/main)
// Applies MonoCode changes since .github/upstream-sync.json to the working tree
// and index without committing. Exit codes: 0 applied or up to date,
// 2 conflicts left in the working tree, 3 upstream history diverged.
// Requires `git fetch upstream main` against hardbeat920/monocode.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUpstreamPatch, SYNC_STATUS } from "./patch-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const target = process.argv[2] ?? "upstream/main";
const result = applyUpstreamPatch({ cwd: root, target });

console.log(JSON.stringify(result, null, 2));

if (result.status === SYNC_STATUS.CONFLICTS) process.exit(2);
if (result.status === SYNC_STATUS.DIVERGED) process.exit(3);
