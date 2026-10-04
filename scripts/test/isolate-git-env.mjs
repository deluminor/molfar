import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Git exports GIT_DIR and friends to hooks (the pre-push hook runs the test
// suite). Tests that spawn git in temporary directories inherit them, so their
// `git init`, `git config` and `git commit` would hit this repository instead.
// Same list as `git rev-parse --local-env-vars`.
const REPOSITORY_ENV_VARS = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
];

for (const name of REPOSITORY_ENV_VARS) {
  delete process.env[name];
}

// A developer's global core.hooksPath (e.g. a commit message policy) would run
// in the temporary repositories tests create and reject their commits. Point
// hooks at an empty directory for every git process the tests start.
const noHooks = mkdtempSync(join(tmpdir(), "molfar-test-no-hooks-"));
process.env.GIT_CONFIG_COUNT = "1";
process.env.GIT_CONFIG_KEY_0 = "core.hooksPath";
process.env.GIT_CONFIG_VALUE_0 = noHooks;
