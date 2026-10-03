#!/usr/bin/env node
// Usage: node scripts/upstream/apply.mjs [target-ref]   (default: origin/upstream-main)
// Applies MonoCode changes since .github/upstream-sync.json to the working tree
// and index without committing. Exit codes: 0 applied or up to date,
// 2 conflicts left in the working tree, 3 upstream history diverged,
// 4 pending ports written to .upstream-pending/ (conflicts may also be present).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUpstreamPatch, SYNC_STATUS } from "./patch-sync.mjs";

const EXIT_CODE = {
  [SYNC_STATUS.CONFLICTS]: 2,
  [SYNC_STATUS.DIVERGED]: 3,
  [SYNC_STATUS.PENDING]: 4,
};

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const target = process.argv[2] ?? "origin/upstream-main";
const result = applyUpstreamPatch({ cwd: root, target });

console.log(JSON.stringify(result, null, 2));

process.exit(EXIT_CODE[result.status] ?? 0);
