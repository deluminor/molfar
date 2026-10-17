import type { UsageProviderId } from "./usageCard";

export const USAGE_PROVIDERS: readonly {
  id: UsageProviderId;
  title: string;
}[] = [
  { id: "codex", title: "Codex" },
  { id: "cursor", title: "Cursor" },
  { id: "claude", title: "Claude" },
  { id: "antigravity", title: "Antigravity" },
];

export function usageProviderTitle(id: UsageProviderId): string {
  return USAGE_PROVIDERS.find((provider) => provider.id === id)?.title ?? id;
}
