/** Node 22+ may expose a broken global `localStorage` that shadows happy-dom. */
function storagePersists(storage) {
  const key = "__molfar_localstorage_probe__";
  try {
    storage.setItem(key, "1");
    const ok = storage.getItem(key) === "1";
    storage.removeItem(key);
    return ok;
  } catch {
    return false;
  }
}

if (
  typeof globalThis.localStorage !== "undefined" &&
  !storagePersists(globalThis.localStorage)
) {
  delete globalThis.localStorage;
}
