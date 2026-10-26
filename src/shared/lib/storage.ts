export type JsonParse<T> = (value: unknown) => T;

export function readJson<T>(
  key: string,
  parse: JsonParse<T>,
  fallback: T,
  storage?: Pick<Storage, "getItem">,
): T {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(key);
    if (raw == null) return fallback;
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function parseStoredJson<T>(
  raw: string,
  parse: JsonParse<T>,
  fallback: T,
): T {
  try {
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeJson(
  key: string,
  value: unknown,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private browsing should not block the feature.
  }
}
