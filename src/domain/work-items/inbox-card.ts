import type { InboxProvider, InboxKind, GithubLabel } from "./work-item";

/** Compact chip shown above the composer when starting from Inbox. */
export type InboxComposerCard = {
  provider: InboxProvider;
  kind: InboxKind;
  identifier: string;
  title: string;
  url: string;
  source: string;
  labels: GithubLabel[];
  prompt: string;
};
