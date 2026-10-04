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

const windows = process.platform === "win32";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    setupFiles: ["scripts/test/isolate-git-env.mjs"],
    // Git fixture suites (scripts/upstream, FileEditorCrlfGit, …) spawn real
    // git processes. On Windows runners under parallel load they exceed the
    // default 5s budget — same pattern as host/vitest.config.ts.
    testTimeout: windows ? 30_000 : 5_000,
    hookTimeout: windows ? 30_000 : 10_000,
    poolOptions: {
      forks: { execArgv },
    },
  },
});
