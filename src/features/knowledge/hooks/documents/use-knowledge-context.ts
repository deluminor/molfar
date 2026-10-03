import { useEffect, useRef, useState } from "react";
import { requestKnowledgeContext } from "../../model/context/knowledge-context";
import type { VaultConnection, VaultDocument } from "../../model/vault/types";

export function useKnowledgeContext(
  connection: VaultConnection | null,
  path: string | null,
  readDocument: () => Promise<VaultDocument>,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const selection = useRef<string | null>(null);
  selection.current =
    connection && path ? JSON.stringify([connection.id, path]) : null;

  useEffect(() => {
    setError(null);
  }, [connection?.id, path]);

  useEffect(
    () => () => {
      selection.current = null;
    },
    [],
  );

  const send = async (): Promise<void> => {
    if (!connection || !selection.current || inFlight.current) return;
    const current = selection.current;
    inFlight.current = true;
    setBusy(true);
    try {
      const document = await readDocument();
      if (selection.current !== current) return;
      requestKnowledgeContext(connection, document);
      setError(null);
    } catch (failure: unknown) {
      if (selection.current === current) setError(String(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { send, busy, error };
}
