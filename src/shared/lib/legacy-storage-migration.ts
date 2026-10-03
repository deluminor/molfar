const LEGACY_PREFIX = "monocode";
const CURRENT_PREFIX = "vatra";
const MIGRATED_KEY = "vatra.storageMigrated.v1";

/** The renamed key for a MonoCode-era `monocode.*` / `monocode:*` key. */
export function legacyStorageTarget(key: string): string | null {
  if (!key.startsWith(`${LEGACY_PREFIX}.`) && !key.startsWith(`${LEGACY_PREFIX}:`)) {
    return null;
  }

  return CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
}

/**
 * Copies settings saved under the pre-rename prefix once. Legacy keys stay in
 * place for rollback; the marker stops a key the app removed on purpose from
 * being resurrected on the next launch. `index.html` inlines the same logic
 * because its theme bootstrap runs before any module.
 */
export function migrateLegacyStorage(storage: Storage): number {
  if (storage.getItem(MIGRATED_KEY) != null) return 0;

  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key != null) keys.push(key);
  }

  let copied = 0;
  for (const key of keys) {
    const target = legacyStorageTarget(key);
    const value = storage.getItem(key);
    if (target == null || value == null || storage.getItem(target) != null) continue;

    storage.setItem(target, value);
    copied += 1;
  }

  storage.setItem(MIGRATED_KEY, "1");
  return copied;
}
