import { invoke } from "@tauri-apps/api/core";
import type { ProviderAccountProvider } from "@/domain/harness/provider-account";

/** Remove a named profile's native credentials before its UI metadata. */
export async function removeProviderAccountCredentials(
  provider: ProviderAccountProvider,
  accountId: string,
): Promise<void> {
  await invoke("provider_account_remove", { provider, accountId });
}
