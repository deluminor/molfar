import { scanVault } from "@/platform/tauri/vault";
import type { VaultSnapshot } from "../../model/vault/types";

let inflight: { vaultId: string; promise: Promise<VaultSnapshot> } | null =
  null;

// Native scans outlive the view; remounts must join the running scan instead of hitting the backend's single-scan guard.
export function sharedVaultScan(vaultId: string): Promise<VaultSnapshot> {
  if (inflight?.vaultId === vaultId) return inflight.promise;

  const promise = scanVault(vaultId).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { vaultId, promise };

  return promise;
}
