function isBrowserFixtureGap(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Unavailable fixture service:");
}

export function logWindowChromeError(scope: string, error: unknown): void {
  // Browser Playwright fixtures omit window plugin commands; do not treat that as a chrome failure.
  if (isBrowserFixtureGap(error)) return;
  console.error(`[molfar] window chrome: ${scope}`, error);
}
