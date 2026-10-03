export function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error);
}
