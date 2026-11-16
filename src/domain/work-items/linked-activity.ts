export type LinkedWorkItemActivityKind =
  "comment" | "review" | "review_comment" | "commit";

export type LinkedWorkItemActivityEntry = {
  id: string;
  kind: LinkedWorkItemActivityKind;
  author: string;
  text: string;
  createdAt: string;
  url: string;
};

export type LinkedWorkItemActivityCounts = {
  comments: number;
  reviews: number;
  commits: number;
};
/** In-memory, one-shot context shown when an updated linked session is opened. */
export type LinkedWorkItemUpdateCard = {
  kind: "issue" | "pr";
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  since: number;
  updatedAt: number;
  status: "loading" | "ready" | "error";
  counts: LinkedWorkItemActivityCounts;
  entries: LinkedWorkItemActivityEntry[];
  truncated: boolean;
};
