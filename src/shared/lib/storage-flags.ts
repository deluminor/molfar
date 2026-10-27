function flagStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readFlag(key: string): boolean | null {
  try {
    const storage = flagStorage();
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (raw == null) return null;
    return raw === "1" || raw === "true";
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: boolean) {
  try {
    const storage = flagStorage();
    if (!storage) return;
    storage.setItem(key, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}
