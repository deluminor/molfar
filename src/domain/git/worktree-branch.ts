export function temporaryWorktreeBranchName(
  id: string = crypto.randomUUID(),
): string {
  const token = id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
  return `molfar/${token || Date.now().toString(36)}`;
}

export function orchestrationWorktreeBranchName(id: string): string {
  const token = id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase();
  return `molfar/orch-${token || Date.now().toString(36)}`;
}

export function namedWorktreeBranch(fragment: string): string | null {
  const clean = fragment
    .trim()
    .replace(/^(?:molfar|vatra|mc|monocode)\/+/, "")
    .replace(/^\/+|\/+$/g, "");
  return clean ? `molfar/${clean}` : null;
}
