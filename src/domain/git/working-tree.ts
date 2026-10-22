export type GitDiffStats = {
  files: number;
  additions: number;
  deletions: number;
};

export type GitChangedFile = {
  path: string;
  relative: string;
  status: "modified" | "added" | "deleted" | "untracked" | string;
  additions: number;
  deletions: number;
  staged: boolean;
  unstaged: boolean;
};

export type GitDiffIndex = {
  branch: string | null;
  head: string | null;
  files: GitChangedFile[];
  additions: number;
  deletions: number;
  remote: string | null;
  upstream: string | null;
  defaultBranch: string | null;
  ahead: number;
  behind: number;
  aheadOfDefault: number;
  headPushed: boolean;
};

export type GitFileDiff = {
  path: string;
  relative: string;
  status: string;
  original: string;
  current: string;
  binary: boolean;
  tooLarge: boolean;
};

export type GitFileDiffKind = "staged" | "unstaged";
