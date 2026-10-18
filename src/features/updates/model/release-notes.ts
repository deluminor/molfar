import bundledChangelog from "../../../../CHANGELOG.md?raw";

export type ReleaseNotesTabSource = {
  version: string;
};

export type ReleaseNotesDocument = {
  source: ReleaseNotesTabSource;
  markdown: string;
};

export function releaseNotesTitle(version: string): string {
  return `What's new in MOLFAR ${version}`;
}

export function releaseNotesForVersion(
  version: string,
  changelog: string = bundledChangelog,
): ReleaseNotesDocument | null {
  const normalized = version.trim();
  if (!normalized || normalized === "Unreleased") return null;

  const escapedVersion = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(
    `^## \\[${escapedVersion}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\r?$`,
    "gm",
  );
  const match = heading.exec(changelog);
  if (!match) return null;

  const nextHeading = /^## /gm;
  nextHeading.lastIndex = match.index + match[0].length;
  const next = nextHeading.exec(changelog);
  const markdown = changelog.slice(match.index, next?.index).trimEnd();

  return {
    source: { version: normalized },
    markdown,
  };
}

export function releaseNotesMarkdown(
  source: ReleaseNotesTabSource,
  changelog: string = bundledChangelog,
): string | null {
  return releaseNotesForVersion(source.version, changelog)?.markdown ?? null;
}

export type ReleaseNotesPresentation = {
  version: string;
  date: string | null;
  markdown: string;
};

/** One release in the What's New accordion: chrome fields + body markdown. */
export type ReleaseNotesEntry = {
  version: string;
  date: string | null;
  foreshadow: string | null;
  markdown: string;
};

/** Default cap when callers want a newest-N window (tests / tooling). */
export const RECENT_RELEASES_LIMIT = 10;

const RELEASE_HEADING =
  /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\r?$/gm;

/** Quiet preview line for a collapsed accordion row (first bullet, plain text). */
export function releaseForeshadow(markdown: string): string | null {
  const match = /^- (.+)$/m.exec(markdown);
  if (!match) return null;

  const plain = match[1]
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

  return plain.length > 0 ? plain : null;
}

/** Changelog body for the What's new modal: version heading lives in the chrome. */
export function presentReleaseNotes(
  version: string,
  changelog: string = bundledChangelog,
): ReleaseNotesPresentation | null {
  const release = releaseNotesForVersion(version, changelog);
  if (!release) return null;

  const escapedVersion = release.source.version.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const heading = new RegExp(
    `^## \\[${escapedVersion}\\](?: - (\\d{4}-\\d{2}-\\d{2}))?\\r?\\n*`,
  );
  const match = heading.exec(release.markdown);

  return {
    version: release.source.version,
    date: match?.[1] ?? null,
    markdown: match
      ? release.markdown.slice(match[0].length).trimStart()
      : release.markdown,
  };
}

/**
 * Bundled releases newest-first, skipping Unreleased.
 * Pass a finite `limit` to cap the list; omit or use Infinity for every release.
 */
export function listRecentReleases(
  changelog: string = bundledChangelog,
  limit: number = Number.POSITIVE_INFINITY,
): ReleaseNotesEntry[] {
  if (limit <= 0) return [];

  const entries: ReleaseNotesEntry[] = [];
  const heading = new RegExp(RELEASE_HEADING.source, "gm");
  let match: RegExpExecArray | null;

  while ((match = heading.exec(changelog)) !== null) {
    const version = match[1];
    if (!version || version === "Unreleased") continue;

    const presented = presentReleaseNotes(version, changelog);
    if (!presented) continue;

    entries.push({
      version: presented.version,
      date: presented.date,
      foreshadow: releaseForeshadow(presented.markdown),
      markdown: presented.markdown,
    });

    if (entries.length >= limit) break;
  }

  return entries;
}

/**
 * What's New accordion: every bundled release, newest first.
 * Optional `limit` keeps the older focus-append behavior for callers that still
 * want a newest-N window (tests).
 */
export function listWhatsNewReleases(
  focusVersion: string,
  changelog: string = bundledChangelog,
  limit: number = Number.POSITIVE_INFINITY,
): ReleaseNotesEntry[] {
  const recent = listRecentReleases(changelog, limit);
  const normalized = focusVersion.trim();
  if (
    !Number.isFinite(limit) ||
    !normalized ||
    recent.some((entry) => entry.version === normalized)
  ) {
    return recent;
  }

  const focused = presentReleaseNotes(normalized, changelog);
  if (!focused) return recent;

  return [
    ...recent.slice(0, Math.max(0, limit - 1)),
    {
      version: focused.version,
      date: focused.date,
      foreshadow: releaseForeshadow(focused.markdown),
      markdown: focused.markdown,
    },
  ];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatCalendarDay(match: RegExpExecArray): string | null {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isRealDay =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!isRealDay) return null;

  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatReleaseDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  return formatCalendarDay(match) ?? iso;
}

/** Updater `pub_date` arrives as `2026-10-03 14:18:46.976 +00:00:00`; only the day is shown. */
export function formatUpdateDate(date: string | undefined): string | null {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!match) return null;

  return formatCalendarDay(match);
}
