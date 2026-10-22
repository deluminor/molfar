export type GithubTaskKind = "issue" | "pr";
export type InboxKind = GithubTaskKind | "linear" | "jira";

export type GithubLabel = {
  name: string;
  color: string;
};
export type InboxProvider =
  "github" | "linear" | "jira" | "gitlab" | "azuredevops";
