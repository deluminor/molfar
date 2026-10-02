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
const repository = process.env.GITHUB_REPOSITORY || "deluminor/vatra";

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

function commitSubjectsSince(previousTag) {
  const base = previousTag || tryGit("log", "-1", "--format=%H", "--", "CHANGELOG.md");
  const range = base ? `${base}..HEAD` : "HEAD";
  const log = tryGit("log", "--no-merges", "--format=%s", range);
  return log ? log.split("\n") : [];
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

  const previousTag = tryGit("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*");
  const changelogPath = join(root, "CHANGELOG.md");
  const prepared = prepareChangelog(readFileSync(changelogPath, "utf8"), {
    version,
    date: new Date().toISOString().slice(0, 10),
    fallback: notesFromCommits(commitSubjectsSince(previousTag)),
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
