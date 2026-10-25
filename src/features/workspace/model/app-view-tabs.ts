export const APP_VIEW_LABELS = {
  search: "Search",
  inbox: "Inbox",
  notes: "Notes",
  automations: "Automations",
} as const;

export type AppView = keyof typeof APP_VIEW_LABELS;

export function appViewTabId(view: AppView): string {
  return `app-view:${view}`;
}

export function appViewForTab(id: string): AppView | undefined {
  if (!id.startsWith("app-view:")) return;
  const view = id.slice("app-view:".length);
  return Object.prototype.hasOwnProperty.call(APP_VIEW_LABELS, view)
    ? (view as AppView)
    : undefined;
}

/** A Familiar open as a title tab in the inset layout. */
export function familiarTabId(familiarId: string): string {
  return `familiar:${familiarId}`;
}

export function familiarForTab(id: string): string | undefined {
  return id.startsWith("familiar:") ? id.slice("familiar:".length) : undefined;
}

/** Whether a title tab is a view of its own rather than a workspace tab. */
export function isViewTab(id: string): boolean {
  return !!appViewForTab(id) || !!familiarForTab(id);
}

/** Keep the shared order and append newly opened tabs regardless of type. */
export function reconcileTitleTabOrder(
  order: string[],
  openIds: readonly string[],
): string[] {
  const open = new Set(openIds);
  const next = order.filter((id) => open.has(id));
  const seen = new Set(next);
  for (const id of openIds) {
    if (seen.has(id)) continue;
    next.push(id);
    seen.add(id);
  }
  return next.length === order.length &&
    next.every((id, index) => id === order[index])
    ? order
    : next;
}

/** Closing the active tab keeps focus at its slot, falling left at the end. */
export function nextDisplayedTabAfterClose(
  tabs: readonly { id: string }[],
  activeId: string,
  closingId: string,
): string | undefined {
  if (closingId !== activeId) return;
  const index = tabs.findIndex((tab) => tab.id === closingId);
  if (index < 0) return;
  return tabs[index + 1]?.id ?? tabs[index - 1]?.id;
}

/** The app view covering the workspace; a later one in this order never shows over an earlier one. */
export function shownAppView(open: {
  search: boolean;
  inbox: boolean;
  notes: boolean;
  automations: boolean;
}): AppView | undefined {
  if (open.search) return "search";
  if (open.inbox) return "inbox";
  if (open.notes) return "notes";
  if (open.automations) return "automations";
  return undefined;
}
