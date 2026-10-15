import type { Review } from "../types/artifact";
import type { Card, Delivery } from "../types/card";
import { specPrTitle } from "./artifacts/spec-frontmatter";

const MAX_BODY = 60_000;

export function pullRequestTitle(card: Pick<Card, "title">, spec: string | undefined): string {
  return (spec && specPrTitle(spec)) || card.title;
}

/** PR description from the card's own artifacts; no attribution, no names. */
export function pullRequestBody(
  card: Pick<Card, "number" | "description">,
  implReport: string | undefined,
  review: Review | undefined,
): string {
  const sections = [`## Summary\n\n${card.description.trim()}`];
  if (implReport) sections.push(`## Implementation\n\n${implReport.trim()}`);
  if (review) {
    const open = review.findings.length;
    sections.push(`## Review\n\nVerdict: ${review.verdict} (${open} finding${open === 1 ? "" : "s"})`);
  }
  sections.push(`Task Board card #${card.number}.`);
  return sections.join("\n\n").slice(0, MAX_BODY);
}

export function pullRequestNumber(url: string): number | null {
  const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

/** The stored delivery record, or null when it is missing or not recognizable. */
export function parseDelivery(json: string | null): Delivery | null {
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const method = raw.method;
  if (method !== "pr" && method !== "merge" && method !== "keep") return null;
  return {
    method,
    deliveredAt: typeof raw.deliveredAt === "number" ? raw.deliveredAt : 0,
    ...(typeof raw.prUrl === "string" ? { prUrl: raw.prUrl } : {}),
    ...(raw.merged === true ? { merged: true } : {}),
  };
}
