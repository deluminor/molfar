import { defineConfig } from "vitest/config";

// Node 25+ ships a global `localStorage` that shadows the DOM environment's
// implementation and is undefined without a backing file. Older Node rejects
// the flag, so only pass it where it exists.
const webStorageFlag = "--no-experimental-webstorage";
const execArgv = process.allowedNodeEnvironmentFlags.has(
  "--experimental-webstorage",
)
  ? [webStorageFlag]
  : [];

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    setupFiles: ["scripts/test/isolate-git-env.mjs"],
    poolOptions: {
      forks: { execArgv },
    },
  },
});
