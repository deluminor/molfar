import { namedWorktreeBranch } from "@/domain/git/worktree-branch";

const MAX_SLUG = 40;

/** `molfar/task-<6-char id>-<title slug>`, stable for the card's lifetime. */
export function taskBranchName(cardId: string, title: string): string {
  const token = cardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase();
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  const fragment = slug ? `task-${token}-${slug}` : `task-${token}`;
  return namedWorktreeBranch(fragment) ?? `molfar/${fragment}`;
}
