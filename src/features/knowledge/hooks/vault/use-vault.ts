import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelVaultScan,
  connectVault,
  disconnectVault,
  vaultStatus,
} from "../../../../platform/tauri/vault";
import { parseVaultConnection } from "../../model/vault/parse-vault";
import type { VaultConnection, VaultSnapshot } from "../../model/vault/types";
import { listen } from "@tauri-apps/api/event";
import { VAULT_CONNECTION_EVENT, VAULT_REFRESH_MS } from "./constants";
import { sharedVaultScan } from "./shared-scan";

export function useVault() {
  const [connection, setConnection] = useState<VaultConnection | null>(null);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const generation = useRef(0);
  const connectionId = useRef<string | null>(null);

  const applyConnection = useCallback((next: VaultConnection | null) => {
    const nextId = next?.id ?? null;
    if (nextId === connectionId.current) return;

    connectionId.current = nextId;
    generation.current += 1;
    setConnection(next);
    setSnapshot(null);
    setScanBusy(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!connection) return;
    setScanBusy(true);
    setProgress(0);
    const current = generation.current;

    try {
      const next = await sharedVaultScan(connection.id);
      if (current === generation.current) {
        setSnapshot(next);
        setError(null);
      }
    } catch (failure: unknown) {
      if (current === generation.current) setError(String(failure));
    } finally {
      if (current === generation.current) setScanBusy(false);
    }
  }, [connection]);

  useEffect(() => {
    let alive = true;
    void vaultStatus()
      .then((next) => {
        if (alive) applyConnection(next);
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      generation.current += 1;
    };
  }, [applyConnection]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listen<unknown>(VAULT_CONNECTION_EVENT, ({ payload }) => {
      if (!alive) return;
      try {
        applyConnection(
          payload === null ? null : parseVaultConnection(payload),
        );
        setError(null);
      } catch (failure: unknown) {
        setError(String(failure));
      }
    })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [applyConnection]);

  useEffect(() => {
    if (!connection) return;
    void refresh();
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(visibleRefresh, VAULT_REFRESH_MS);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [connection, refresh]);

  useEffect(() => {
    if (!connection) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listen<{ vaultId: string; entries: number }>(
      "knowledge:scan-progress",
      ({ payload }) => {
        if (
          alive &&
          payload.vaultId === connection.id &&
          Number.isFinite(payload.entries)
        )
          setProgress(payload.entries);
      },
    )
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [connection]);

  const cancel = useCallback(async () => {
    if (!connection) return;
    try {
      await cancelVaultScan(connection.id);
    } catch (failure: unknown) {
      setError(String(failure));
    }
  }, [connection]);

  const connect = useCallback(
    async (path: string) => {
      setBusy(true);
      setError(null);
      try {
        applyConnection(await connectVault(path));
      } catch (failure: unknown) {
        setError(String(failure));
      } finally {
        setBusy(false);
      }
    },
    [applyConnection],
  );

  const disconnect = useCallback(async () => {
    if (!connection) return false;
    setBusy(true);
    try {
      await disconnectVault(connection.id);
      applyConnection(null);
      setError(null);
      return true;
    } catch (failure: unknown) {
      setError(String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }, [applyConnection, connection]);

  return {
    connection,
    snapshot,
    busy,
    scanBusy,
    progress,
    cancel,
    error,
    connect,
    disconnect,
    refresh,
  };
}
