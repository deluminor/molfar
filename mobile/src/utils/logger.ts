export function logDebug(
  event: string,
  fields: Record<string, string | number>,
): void {
  if (!__DEV__) return;

  console.debug(JSON.stringify({ event, ...fields }));
}
