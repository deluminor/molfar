import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  parseVaultConnection,
  parseVaultDocument,
  parseVaultSnapshot,
} from "./parse-vault";
import type { VaultConnection, VaultDocument, VaultSnapshot } from "./types";

export async function vaultStatus(): Promise<VaultConnection | null> {
  const value = await invoke<unknown>("vault_status");

  return value === null ? null : parseVaultConnection(value);
}

export async function connectVault(path: string): Promise<VaultConnection> {
  return parseVaultConnection(await invoke<unknown>("vault_connect", { path }));
}

export async function scanVault(vaultId: string): Promise<VaultSnapshot> {
  return parseVaultSnapshot(await invoke<unknown>("vault_scan", { vaultId }));
}

export async function readVaultNote(
  vaultId: string,
  path: string,
): Promise<VaultDocument> {
  return parseVaultDocument(
    await invoke<unknown>("vault_read", { vaultId, path }),
  );
}

export async function saveVaultNote(
  vaultId: string,
  path: string,
  body: string,
  revision: string,
): Promise<VaultDocument> {
  return parseVaultDocument(
    await invoke<unknown>("vault_save", { vaultId, path, body, revision }),
  );
}

export async function disconnectVault(vaultId: string): Promise<void> {
  await invoke("vault_disconnect", { vaultId });
}

export async function vaultAssetPath(
  vaultId: string,
  path: string,
): Promise<string> {
  const result = await invoke<unknown>("vault_asset_path", { vaultId, path });
  if (typeof result !== "string")
    throw new Error("Invalid Knowledge asset response.");

  return result;
}

export async function cancelVaultScan(vaultId: string): Promise<void> {
  await invoke("vault_cancel_scan", { vaultId });
}

export async function pickVaultFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Connect Obsidian vault",
  });

  if (selected === null || typeof selected === "string") return selected;
  throw new Error("Choose exactly one vault folder.");
}
