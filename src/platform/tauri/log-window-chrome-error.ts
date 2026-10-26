export function logWindowChromeError(scope: string, error: unknown): void {
  console.error(`[molfar] window chrome: ${scope}`, error);
}
