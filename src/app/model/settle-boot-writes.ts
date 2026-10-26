/** Boot-resume writes are best effort: every one is attempted and each failure is logged. */
export async function settleBootWrites(writes: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(writes);

  for (const result of results) {
    if (result.status === "rejected") console.error("Boot resume: a workspace write failed", result.reason);
  }
}
