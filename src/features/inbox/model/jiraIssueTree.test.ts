import { describe, expect, it } from "vitest";
import { inboxItemKey, type InboxItem } from "./githubTasks";
import {
  buildJiraIssueTree,
  defaultExpandedJiraKeys,
  flattenJiraIssueTree,
} from "./jiraIssueTree";

function jira(
  overrides: Partial<InboxItem> &
    Pick<InboxItem, "identifier" | "title" | "updatedAt">,
): InboxItem {
  return {
    provider: "jira",
    kind: "jira",
    number: Number(overrides.identifier?.split("-")[1] ?? 1),
    url: `https://acme.atlassian.net/browse/${overrides.identifier}`,
    state: "In Progress",
    stateType: "indeterminate",
    labels: [],
    assignees: [],
    draft: false,
    repo: "ENG",
    teamId: "10000",
    teamName: "Engineering",
    projectPath: "",
    id: overrides.identifier,
    ...overrides,
  };
}

describe("buildJiraIssueTree", () => {
  it("nests children under a present parent", () => {
    const epic = jira({
      identifier: "ENG-1",
      title: "Auth",
      issueType: "Epic",
      updatedAt: "2026-08-27T12:00:00Z",
    });
    const story = jira({
      identifier: "ENG-2",
      title: "Login",
      issueType: "Story",
      parentKey: "ENG-1",
      updatedAt: "2026-08-27T11:00:00Z",
    });
    const task = jira({
      identifier: "ENG-3",
      title: "Form",
      issueType: "Task",
      parentKey: "ENG-2",
      updatedAt: "2026-08-27T10:00:00Z",
    });
    const roots = buildJiraIssueTree([task, story, epic]);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.item.identifier).toBe("ENG-1");
    expect(roots[0]?.children[0]?.item.identifier).toBe("ENG-2");
    expect(roots[0]?.children[0]?.children[0]?.item.identifier).toBe("ENG-3");
  });

  it("keeps orphans at the root when the parent is missing", () => {
    const orphan = jira({
      identifier: "ENG-9",
      title: "Orphan task",
      issueType: "Task",
      parentKey: "ENG-missing",
      updatedAt: "2026-08-27T10:00:00Z",
    });
    const roots = buildJiraIssueTree([orphan]);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.item.identifier).toBe("ENG-9");
    expect(roots[0]?.children).toEqual([]);
  });

  it("breaks cycles by treating the looping child as a root", () => {
    const a = jira({
      identifier: "ENG-1",
      title: "A",
      parentKey: "ENG-2",
      updatedAt: "2026-08-27T12:00:00Z",
    });
    const b = jira({
      identifier: "ENG-2",
      title: "B",
      parentKey: "ENG-1",
      updatedAt: "2026-08-27T11:00:00Z",
    });
    const roots = buildJiraIssueTree([a, b]);
    expect(roots.map((node) => node.item.identifier).sort()).toEqual([
      "ENG-1",
      "ENG-2",
    ]);
  });
});

describe("flattenJiraIssueTree", () => {
  it("honours expand state and default root expansion", () => {
    const epic = jira({
      identifier: "ENG-1",
      title: "Auth",
      issueType: "Epic",
      updatedAt: "2026-08-27T12:00:00Z",
    });
    const story = jira({
      identifier: "ENG-2",
      title: "Login",
      issueType: "Story",
      parentKey: "ENG-1",
      updatedAt: "2026-08-27T11:00:00Z",
    });
    const roots = buildJiraIssueTree([epic, story]);
    const expanded = defaultExpandedJiraKeys(roots);
    expect([...expanded]).toEqual([inboxItemKey(epic)]);
    const rows = flattenJiraIssueTree(roots, expanded);
    expect(rows.map((row) => [row.item.identifier, row.depth, row.expanded])).toEqual([
      ["ENG-1", 0, true],
      ["ENG-2", 1, false],
    ]);
    expect(flattenJiraIssueTree(roots, new Set()).map((row) => row.item.identifier)).toEqual([
      "ENG-1",
    ]);
  });
});
