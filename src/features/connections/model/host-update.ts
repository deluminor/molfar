/**
 * Why a connected host should run Update Host, or null when it is current.
 * The descriptor comes off the wire, so a missing list counts as outdated.
 */
export function hostUpdateReason(host: { capabilities?: string[] }): string | null {
  const capabilities = host.capabilities ?? [];
  if (!capabilities.includes("workspace.run") || !capabilities.includes("git.worktreeCreate")) {
    return "host update needed for Explorer and Changes";
  }
  return null;
}
