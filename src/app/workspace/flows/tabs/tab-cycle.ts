/** The tab `delta` positions from the active one, wrapping around the ends. */
export function cycleTab<T extends { id: string }>(
  tabs: readonly T[],
  activeTabId: string,
  delta: 1 | -1,
): T | undefined {
  const index = tabs.findIndex((tab) => tab.id === activeTabId);
  if (index < 0) return undefined;

  return tabs[(index + delta + tabs.length) % tabs.length];
}

/** The tab in a 0-based slot; a negative slot means the last tab. */
export function tabInSlot<T>(tabs: readonly T[], slot: number): T | undefined {
  return slot < 0 ? tabs[tabs.length - 1] : tabs[slot];
}
