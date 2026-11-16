import { inboxItemKey, type InboxItem } from "./github-tasks";

export type JiraIssueTreeNode = {
  item: InboxItem;
  children: JiraIssueTreeNode[];
};

export type JiraIssueTreeRow = {
  item: InboxItem;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Last visible sibling at this depth — tree rail stops at mid-row. */
  isLastSibling: boolean;
};

/**
 * Build a forest from Jira inbox items using `parentKey` → `identifier`.
 * Missing parents and cycles become roots (orphans keep their type badge).
 */
export function buildJiraIssueTree(
  items: readonly InboxItem[],
): JiraIssueTreeNode[] {
  const jira = items.filter((item) => item.provider === "jira");
  const byKey = new Map<string, InboxItem>();
  for (const item of jira) {
    const key = item.identifier?.trim();
    if (key) byKey.set(key, item);
  }

  const childIds = new Map<string, string[]>();
  const rootIds: string[] = [];
  const visiting = new Set<string>();

  const wouldCycle = (childKey: string, parentKey: string): boolean => {
    let cursor: string | undefined = parentKey;
    visiting.clear();
    while (cursor) {
      if (cursor === childKey) return true;
      if (visiting.has(cursor)) return true;
      visiting.add(cursor);
      cursor = byKey.get(cursor)?.parentKey?.trim() || undefined;
      if (cursor && !byKey.has(cursor)) break;
    }
    return false;
  };

  for (const item of jira) {
    const id = item.identifier?.trim();
    if (!id) continue;
    const parentKey = item.parentKey?.trim() ?? "";
    if (
      parentKey &&
      byKey.has(parentKey) &&
      parentKey !== id &&
      !wouldCycle(id, parentKey)
    ) {
      const siblings = childIds.get(parentKey) ?? [];
      siblings.push(id);
      childIds.set(parentKey, siblings);
    } else {
      rootIds.push(id);
    }
  }

  const buildNode = (id: string): JiraIssueTreeNode | null => {
    const item = byKey.get(id);
    if (!item) return null;
    const children = (childIds.get(id) ?? [])
      .map(buildNode)
      .filter((node): node is JiraIssueTreeNode => node !== null)
      .sort(compareNodes);
    return { item, children };
  };

  return rootIds
    .map(buildNode)
    .filter((node): node is JiraIssueTreeNode => node !== null)
    .sort(compareNodes);
}

export function flattenJiraIssueTree(
  roots: readonly JiraIssueTreeNode[],
  expanded: ReadonlySet<string>,
): JiraIssueTreeRow[] {
  const rows: JiraIssueTreeRow[] = [];
  const walk = (nodes: readonly JiraIssueTreeNode[], depth: number) => {
    nodes.forEach((node, index) => {
      const key = inboxItemKey(node.item);
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && expanded.has(key);
      rows.push({
        item: node.item,
        depth,
        hasChildren,
        expanded: isExpanded,
        isLastSibling: index === nodes.length - 1,
      });
      if (isExpanded) walk(node.children, depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

/** Default: expand every root that has children. */
export function defaultExpandedJiraKeys(
  roots: readonly JiraIssueTreeNode[],
): Set<string> {
  const keys = new Set<string>();
  for (const root of roots) {
    if (root.children.length > 0) keys.add(inboxItemKey(root.item));
  }
  return keys;
}

function compareNodes(a: JiraIssueTreeNode, b: JiraIssueTreeNode): number {
  return Date.parse(b.item.updatedAt) - Date.parse(a.item.updatedAt);
}
