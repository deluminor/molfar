/**
 * Names the plan block a turn owns, so its later snapshots reach that block
 * even once a mid-turn follow-up has appended a user block past it. The turn
 * counter restarts with the app while the key is saved with the transcript, so
 * the number alone would let a fresh turn adopt a plan from before the restart.
 */
export function planTurnKey(gen: number): string {
  return `turn:${gen}:${crypto.randomUUID()}`;
}

/** Provider messages that can arrive as ordinary assistant text despite no work occurring. */
export function isProviderFailureText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return [
    /(?:^|\n)\s*upgrade your plan to continue[.!]?\s*(?:$|\n)/i,
    /(?:^|\n)\s*(?:you(?:'ve| have) )?reached (?:your )?(?:usage|request|spend) limit/i,
    /(?:^|\n)\s*(?:usage|rate|request) limit (?:reached|exceeded)/i,
    /(?:^|\n)\s*(?:authentication required|please (?:sign|log) in to continue)/i,
  ].some((pattern) => pattern.test(value));
}

/** A fallback assistant response must look like an authored Markdown plan. */
export function isReviewablePlan(text: string): boolean {
  const value = text.trim();
  if (!value || isProviderFailureText(value)) return false;
  const hasHeading = /^\s{0,3}#{1,6}\s+\S/m.test(value);
  const steps = value.match(/^\s*(?:[-*+] |\d+[.)] )\S/gm)?.length ?? 0;
  return hasHeading || steps >= 2;
}
