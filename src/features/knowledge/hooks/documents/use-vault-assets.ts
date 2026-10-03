import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { vaultAssetPath } from "@/platform/tauri/vault";
import { vaultPreviewAssetPaths } from "../../model/document/prepare-vault-preview";

export function useVaultAssets(vaultId: string | undefined, markdown: string) {
  const [sources, setSources] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSources(new Map());
    setError(null);
    if (!vaultId) return;
    const allPaths = vaultPreviewAssetPaths(markdown);
    const paths = allPaths.slice(0, 50);
    void Promise.allSettled(
      paths.map(async (path) => {
        const absolute = await vaultAssetPath(vaultId, path);
        return [
          "knowledge-asset/" + encodeURIComponent(path),
          convertFileSrc(absolute),
        ] as const;
      }),
    ).then((results) => {
      if (!alive) return;
      const resolved = new Map<string, string>();
      const failures: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled")
          resolved.set(result.value[0], result.value[1]);
        else failures.push(String(result.reason));
      }
      setSources(resolved);
      if (allPaths.length > paths.length)
        failures.push(
          "Only the first 50 attachments are loaded in this preview.",
        );
      if (failures.length)
        setError(`Some attachments could not load: ${failures.join("; ")}`);
    });
    return () => {
      alive = false;
    };
  }, [vaultId, markdown]);
  return { sources, error };
}
