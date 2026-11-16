const PANE_WIDTH_PREFIX = "molfar.paneWidth.";

export function paneWidthStorageKey(pane: string): string {
  return `${PANE_WIDTH_PREFIX}${pane}`;
}

export function parsePaneWidth(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function loadPaneWidth(key: string): number | null {
  try {
    return parsePaneWidth(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function savePaneWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Private mode / quota: the width simply stays session-local.
  }
}
