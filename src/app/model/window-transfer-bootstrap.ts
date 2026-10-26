import { invoke } from "@tauri-apps/api/core";
import { parseStoredJson } from "@/shared/lib/storage";
import type { WindowTransferPayload } from "./window-transfer";

let transferPromise: Promise<WindowTransferPayload | null> | null = null;

/** One take per webview — safe under React StrictMode double-mount. */
export function loadWindowTransfer(): Promise<WindowTransferPayload | null> {
  if (!transferPromise) {
    transferPromise = invoke<string | null>("take_window_transfer")
      .then((raw) =>
        raw
          ? parseStoredJson(
              raw,
              (value) => value as WindowTransferPayload,
              null,
            )
          : null,
      )
      .catch(() => null);
  }
  return transferPromise;
}
