import { describe, expect, it } from "vitest";
import type { GitDiffIndex } from "../../../platform/tauri/fs";
import { gitPulse } from "./gitPulse";

const CLEAN: GitDiffIndex = {
  branch: "main",
  head: "abc123",
  files: [],
  additions: 0,
  deletions: 0,
  remote: "origin",
  upstream: "origin/main",
  defaultBranch: "main",
  ahead: 0,
  behind: 0,
  aheadOfDefault: 0,
  headPushed: true,
};

describe("gitPulse", () => {
  it("is unavailable without a repository head", () => {
    expect(gitPulse({ ...CLEAN, branch: null, head: null }, "")).toBeNull();
  });

  it("summarises a dirty branch with sync counts and subject", () => {
    expect(
      gitPulse(
        {
          ...CLEAN,
          branch: "feat/x",
          ahead: 2,
          behind: 1,
        },
        "fix: thing\n\nbody",
      ),
    ).toMatchObject({
      branch: "feat/x",
      dirty: false,
      ahead: 2,
      behind: 1,
      tracking: true,
      subject: "fix: thing",
    });
  });

  it("counts changed files as dirty and handles detached, untracked heads", () => {
    const pulse = gitPulse(
      {
        ...CLEAN,
        branch: null,
        upstream: null,
        files: [
          {
            path: "/p/a",
            relative: "a",
            status: "modified",
            additions: 1,
            deletions: 0,
            staged: false,
            unstaged: true,
          },
        ],
      },
      "",
    );
    expect(pulse).toMatchObject({
      branch: "abc123",
      dirty: true,
      changedCount: 1,
      tracking: false,
      subject: null,
    });
  });
});
