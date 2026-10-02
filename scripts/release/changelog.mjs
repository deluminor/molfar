const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const UNRELEASED_HEADING = /^## \[Unreleased\][^\n]*\n/m;
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/** Keep a Changelog sections, in display order, for conventional commit types. */
const SECTIONS = [
  { title: "Added", types: ["feat"] },
  { title: "Changed", types: ["perf", "refactor", "revert"] },
  { title: "Fixed", types: ["fix"] },
];
const SKIPPED_TYPES = new Set(["build", "chore", "ci", "docs", "style", "test"]);

export function parseVersion(version) {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`Not a release version: ${version}`);
  return match.slice(1).map(Number);
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function bumpVersion(current, request) {
  const [major, minor, patch] = parseVersion(current);
  switch (request) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return request.trim().replace(/^v/, "");
  }
}

/** `patch` / `minor` / `major` bump the current version; anything else is taken literally. */
export function resolveNextVersion(current, request) {
  const next = bumpVersion(current, request);

  parseVersion(next);
  if (compareVersions(next, current) <= 0) {
    throw new Error(`Release ${next} must be newer than the current ${current}`);
  }
  return next;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionBounds(changelog, headingPattern) {
  const heading = headingPattern.exec(changelog);
  if (!heading) return null;

  const start = heading.index;
  const bodyStart = start + heading[0].length;
  const next = /^## |^\[[^\]]+\]: /m.exec(changelog.slice(bodyStart));
  const end = next ? bodyStart + next.index : changelog.length;
  return { start, bodyStart, end };
}

function versionHeading(version) {
  return new RegExp(`^## \\[${escape(version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\r?\\n`, "m");
}

/** Body of a released version's section, without its heading. */
export function releaseNotes(changelog, version) {
  const bounds = sectionBounds(changelog, versionHeading(version));
  if (!bounds) return null;

  return changelog.slice(bounds.bodyStart, bounds.end).trim();
}

export function unreleasedNotes(changelog) {
  const bounds = sectionBounds(changelog, UNRELEASED_HEADING);
  if (!bounds) return "";

  return changelog.slice(bounds.bodyStart, bounds.end).trim();
}

function describeCommit(subject) {
  const match = CONVENTIONAL.exec(subject.trim());
  if (!match) return { section: "Changed", text: subject.trim() };

  const [, type, scope, breaking, description] = match;
  if (SKIPPED_TYPES.has(type) && !breaking) return null;

  const section = SECTIONS.find((candidate) => candidate.types.includes(type))?.title ?? "Changed";
  const prefix = breaking ? "**Breaking:** " : "";
  const scoped = scope ? `**${scope}:** ` : "";
  return { section, text: `${prefix}${scoped}${description}` };
}

/** Changelog body built from commit subjects; null when nothing user-facing changed. */
export function notesFromCommits(subjects) {
  const grouped = new Map();
  for (const subject of subjects) {
    if (!subject.trim() || /^Merge (pull request|branch|remote-tracking)/.test(subject)) continue;

    const entry = describeCommit(subject);
    if (!entry) continue;

    const items = grouped.get(entry.section) ?? [];
    if (!items.includes(entry.text)) items.push(entry.text);
    grouped.set(entry.section, items);
  }

  const blocks = SECTIONS.map((section) => section.title)
    .filter((title) => grouped.has(title))
    .map((title) => `### ${title}\n\n${grouped.get(title).map((item) => `- ${item}`).join("\n")}`);
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function updateLinks(changelog, { version, previousTag, repository }) {
  const base = `https://github.com/${repository}`;
  const unreleased = `[Unreleased]: ${base}/compare/v${version}...HEAD`;
  const released = previousTag
    ? `[${version}]: ${base}/compare/${previousTag}...v${version}`
    : `[${version}]: ${base}/releases/tag/v${version}`;

  if (/^\[Unreleased\]: .*$/m.test(changelog)) {
    return changelog.replace(/^\[Unreleased\]: .*$/m, `${unreleased}\n${released}`);
  }
  return `${changelog.trimEnd()}\n\n${unreleased}\n${released}\n`;
}

/**
 * Turns the changelog into its released form for `version`: an existing
 * section is kept, else the Unreleased notes are promoted, else `fallback`
 * (generated from commits) is used. Returns null when there is nothing to
 * release.
 */
export function prepareChangelog(changelog, { version, date, fallback, previousTag, repository }) {
  if (releaseNotes(changelog, version) != null) return { changelog, source: "existing" };

  const unreleased = unreleasedNotes(changelog);
  const body = unreleased || fallback;
  if (!body) return null;

  const section = `## [${version}] - ${date}\n\n${body}\n\n`;
  const bounds = sectionBounds(changelog, UNRELEASED_HEADING);
  let next;
  if (bounds) {
    next = `${changelog.slice(0, bounds.start)}## [Unreleased]\n\n${section}${changelog.slice(bounds.end)}`;
  } else {
    const firstRelease = /^## /m.exec(changelog);
    const at = firstRelease ? firstRelease.index : changelog.length;
    next = `${changelog.slice(0, at)}## [Unreleased]\n\n${section}${changelog.slice(at)}`;
  }

  return {
    changelog: updateLinks(next, { version, previousTag, repository }),
    source: unreleased ? "unreleased" : "commits",
  };
}
