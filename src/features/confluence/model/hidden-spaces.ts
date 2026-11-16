import { readJson, writeJson } from "@/shared/lib/storage";
import { CONFLUENCE_CHANGE_EVENT, HIDDEN_SPACES_KEY } from "./constants";
import type { ConfluenceSpace } from "./types";

function parseHiddenSpaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

export function loadHiddenConfluenceSpaceIds(): string[] {
  try {
    return readJson(HIDDEN_SPACES_KEY, parseHiddenSpaceIds, []);
  } catch (error) {
    console.error("Failed to read Confluence hidden spaces:", error);
    return [];
  }
}

export function saveHiddenConfluenceSpaceIds(ids: string[]): void {
  try {
    writeJson(HIDDEN_SPACES_KEY, ids);
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
