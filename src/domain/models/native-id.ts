import type { HarnessId } from "../harness/harness";

/**
 * Last-resort native id for a saved key no catalog knows.
 *
 * Every concrete Claude model is `claude-` plus a digit-bearing slug
 * (`claude:opus-5-5` → `claude-opus-5-5`); only family aliases (`opus`,
 * `sonnet`) reach the CLI bare. Reconstructing from that convention keeps the
 * provider prefix instead of emitting `opus-5-5`, which the CLI rejects.
 */
export function nativeIdForUnknownKey(id: string): string {
  const trimmed = id.trim();
  const slug = nativeIdFrom(trimmed);
  const colon = trimmed.indexOf(":");
  const harness = colon >= 0 ? trimmed.slice(0, colon).toLowerCase() : "";
  // Picker keys can use dotted versions (`opus-4.8`), while Claude's CLI
  // expects hyphenated native ids (`claude-opus-4-8`).
  return harness === "claude"
    ? claudeNativeId("claude", slug.replace(/\.(?=\d)/g, "-"))
    : slug;
}

/**
 * Claude's CLI rejects digit-bearing slugs without the `claude-` prefix
 * (`opus-5-5` is invalid; `claude-opus-5-5` and the alias `opus` both work).
 * Live `list_models` can still advertise the short form as `value`.
 */
export function claudeNativeId(harness: HarnessId, native: string): string {
  if (harness !== "claude" || !native || native.startsWith("claude-")) {
    return native;
  }
  return /\d/.test(native) ? `claude-${native}` : native;
}

export function nativeIdFrom(id: string): string {
  const trimmed = id.trim();
  const colon = trimmed.indexOf(":");
  const slug = colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
  const bracket = slug.indexOf("[");
  return bracket >= 0 ? slug.slice(0, bracket) : slug;
}

/** Match Claude ids with and without the provider prefix. */
export function comparableNativeId(harness: HarnessId, id: string): string {
  return harness === "claude" ? id.replace(/^claude-/, "") : id;
}
