type Command = (
  method: string,
  params: Record<string, unknown>,
  commandId: string,
) => Promise<unknown>;

const MAX_RECEIPTS = 1000;

/**
 * Runs each phone command once per command ID, so a retried request gets the
 * first run's result. A failed run is forgotten and may be retried.
 */
export function createMobileReceipts() {
  const receipts = new Map<
    string,
    { signature: string; result: Promise<unknown> }
  >();

  return async (
    command: Command,
    method: string,
    params: Record<string, unknown>,
    commandId: string,
  ) => {
    const signature = JSON.stringify([method, params]);
    const existing = receipts.get(commandId);
    if (existing && existing.signature !== signature)
      throw new Error("Command ID was already used with different input");
    if (!existing && receipts.size >= MAX_RECEIPTS) {
      const oldest = receipts.keys().next().value;
      if (oldest) receipts.delete(oldest);
    }

    const result = existing?.result ?? command(method, params, commandId);
    if (!existing) receipts.set(commandId, { signature, result });
    try {
      return await result;
    } catch (error) {
      receipts.delete(commandId);
      throw error;
    }
  };
}
