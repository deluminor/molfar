#!/usr/bin/env node
// Usage: node scripts/release/prepare.mjs <patch|minor|major|X.Y.Z>
// Bumps every manifest and writes the CHANGELOG section for the release. Git
// commit, tag and push stay in the workflow so this script never publishes.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { notesFromCommits, prepareChangelog, resolveNextVersion } from "./changelog.mjs";
import { readVersion, setVersion } from "./set-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repository = process.env.GITHUB_REPOSITORY || "deluminor/molfar";
const UPSTREAM_REF = "refs/remotes/upstream/main";

/** Empty when git fails: a missing tag or an unborn range is an expected answer here. */
function tryGit(...args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function lines(output) {
  return output ? output.split("\n") : [];
}

// Upstream MonoCode commits arrive through sync merges and are described by
// the sync's Unreleased notes; their subjects (and their v0.x tags) must not
// leak into MOLFAR's generated notes or previous-release lookup.
function upstreamExclusion() {
  return tryGit("rev-parse", "-q", "--verify", UPSTREAM_REF) ? [`^${UPSTREAM_REF}`] : [];
}

function previousReleaseTag(exclusion) {
  if (exclusion.length === 0) {
    return tryGit("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*");
  }

  const tags = tryGit(
    "tag", "--list", "v[0-9]*.[0-9]*.[0-9]*",
    "--merged", "HEAD", "--no-merged", UPSTREAM_REF, "--sort=-v:refname",
  );
  return lines(tags)[0] ?? "";
}

/** MOLFAR's own commit subjects; commits that edited CHANGELOG.md already wrote their notes. */
function commitSubjectsSince(previousTag, exclusion) {
  const base = previousTag || tryGit("log", "-1", "--format=%H", "--", "CHANGELOG.md");
  const range = [base ? `${base}..HEAD` : "HEAD", ...exclusion];

  const documented = new Set(lines(tryGit("log", "--no-merges", "--format=%H", ...range, "--", "CHANGELOG.md")));
  const commits = lines(tryGit("log", "--no-merges", "--format=%H %s", ...range));

  return commits
    .map((commit) => commit.split(/ (.*)/s))
    .filter(([hash]) => !documented.has(hash))
    .map(([, subject]) => subject ?? "");
}

const request = process.argv[2];
if (!request) {
  console.error("usage: node scripts/release/prepare.mjs <patch|minor|major|X.Y.Z>");
  process.exit(1);
}

try {
  const current = readVersion(root);
  const version = resolveNextVersion(current, request);
  const tag = `v${version}`;
  if (tryGit("rev-parse", "-q", "--verify", `refs/tags/${tag}`)) {
    throw new Error(`${tag} already exists`);
  }

  const exclusion = upstreamExclusion();
  const previousTag = previousReleaseTag(exclusion);
  const changelogPath = join(root, "CHANGELOG.md");
  const prepared = prepareChangelog(readFileSync(changelogPath, "utf8"), {
    version,
    date: new Date().toISOString().slice(0, 10),
    generated: notesFromCommits(commitSubjectsSince(previousTag, exclusion)),
    previousTag,
    repository,
  });
  if (!prepared) {
    throw new Error("Nothing to release: add notes under ## [Unreleased] or land feat/fix commits first");
  }

  writeFileSync(changelogPath, prepared.changelog);
  setVersion(root, version);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\n`);
  }
  console.log(`Prepared ${tag} from ${current} (notes: ${prepared.source})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
