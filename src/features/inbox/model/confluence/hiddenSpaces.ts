import { CONFLUENCE_CHANGE_EVENT, HIDDEN_SPACES_KEY } from "./constants";
import type { ConfluenceSpace } from "./types";

export function loadHiddenConfluenceSpaceIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_SPACES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  } catch (error) {
    console.error("Failed to read Confluence hidden spaces:", error);
    return [];
  }
}

export function saveHiddenConfluenceSpaceIds(ids: string[]): void {
  try {
    localStorage.setItem(HIDDEN_SPACES_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error("Failed to save Confluence hidden spaces:", error);
  }

  notifyConfluenceChange();
}

export function notifyConfluenceChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONFLUENCE_CHANGE_EVENT));
}

export function visibleConfluenceSpaces(
  spaces: readonly ConfluenceSpace[],
  hiddenIds: readonly string[],
): ConfluenceSpace[] {
  if (hiddenIds.length === 0) return [...spaces];

  const hidden = new Set(hiddenIds);
  return spaces.filter((space) => !hidden.has(space.id));
}
