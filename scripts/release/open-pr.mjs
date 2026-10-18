// Usage: node scripts/release/open-pr.mjs --base <branch> --head <branch> --title <text> --body <text> --expected-sha <sha>
// Opens (or reuses) the release PR after a fresh head push. GitHub's GraphQL
// createPullRequest often races a force-pushed release head (REST compare can
// already show ahead_by > 0 while GraphQL still reports "No commits between").
// Wait on the compare API, then create via REST -- and retry with backoff.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_WAIT_ATTEMPTS = 30;
const DEFAULT_WAIT_MS = 2000;
const DEFAULT_CREATE_ATTEMPTS = 15;
const DEFAULT_CREATE_MS = 3000;

/** GitHub PR-create race right after pushing a new or force-updated release head. */
export function isCreatePullRequestRaceError(message) {
  const text = String(message ?? "");
  return (
    /No commits between/i.test(text) ||
    /Head sha can't be blank/i.test(text) ||
    /Base sha can't be blank/i.test(text) ||
    /Head ref must be a branch/i.test(text) ||
    /A pull request already exists/i.test(text)
  );
}

/**
 * @param {{
 *   repository: string;
 *   base: string;
 *   head: string;
 *   expectedSha: string;
 *   attempts?: number;
 *   delayMs?: number;
 *   delay?: (ms: number) => void;
 *   apiJson: (path: string) => unknown;
 * }} options
 */
export function waitForHeadAhead(options) {
  const {
    repository,
    base,
    head,
    expectedSha,
    attempts = DEFAULT_WAIT_ATTEMPTS,
    delayMs = DEFAULT_WAIT_MS,
    delay = sleepMs,
    apiJson,
  } = options;

  const normalized = expectedSha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`expected-sha must be a full 40-char commit SHA, got: ${expectedSha}`);
  }

  let lastDetail = "not checked yet";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const tip = apiJson(`repos/${repository}/commits/${encodeURIComponent(head)}`);
      const tipSha = String(tip?.sha ?? "").toLowerCase();
      const compare = apiJson(
        `repos/${repository}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      );
      const aheadBy = Number(compare?.ahead_by ?? 0);
      lastDetail = `tip=${tipSha || "missing"} ahead_by=${Number.isFinite(aheadBy) ? aheadBy : "n/a"}`;

      if (tipSha === normalized && aheadBy > 0) {
        if (attempt > 1) {
          console.error(
            `GitHub sees ${head} ahead of ${base} after ${attempt} attempt(s) (${lastDetail}).`,
          );
        }
        return { tipSha, aheadBy, attempts: attempt };
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    if (attempt === attempts) break;
    delay(delayMs);
  }

  throw new Error(
    `GitHub still does not see ${head}@${normalized} ahead of ${base} after ${attempts} attempt(s) (${lastDetail}).`,
  );
}

/**
 * Build the `head` value for REST `POST /repos/{owner}/{repo}/pulls`.
 * Same-repo PRs need `owner:branch` so GitHub does not resolve the head against
 * a fork of the authenticated user.
 *
 * @param {string} repository `owner/name`
 * @param {string} head branch name or `owner:branch`
 */
export function restHeadRef(repository, head) {
  const trimmed = head.trim();
  if (trimmed.includes(":")) return trimmed;
  const owner = repository.split("/")[0]?.trim();
  if (!owner) {
    throw new Error(`repository must be owner/name, got: ${repository}`);
  }
  return `${owner}:${trimmed}`;
}

/**
 * @param {{
 *   repository: string;
 *   base: string;
 *   head: string;
 *   title: string;
 *   body: string;
 *   apiJson: (path: string, init?: { method?: string; fields?: Record<string, string> }) => unknown;
 * }} options
 * @returns {string} PR HTML URL
 */
export function createPullRequestRest(options) {
  const { repository, base, head, title, body, apiJson } = options;
  const created = apiJson(`repos/${repository}/pulls`, {
    method: "POST",
    fields: {
      title,
      body,
      head: restHeadRef(repository, head),
      base,
    },
  });
  const url = String(created?.html_url ?? "").trim();
  if (!url) {
    throw new Error("REST pull request create returned no html_url");
  }
  return url;
}

/**
 * @param {{
 *   base: string;
 *   head: string;
 *   createAttempts?: number;
 *   delayMs?: number;
 *   delay?: (ms: number) => void;
 *   listOpenPrUrl: () => string | null;
 *   createPr: () => string;
 * }} options
 * @returns {string} PR URL
 */
export function openOrReusePullRequest(options) {
  const {
    base,
    head,
    createAttempts = DEFAULT_CREATE_ATTEMPTS,
    delayMs = DEFAULT_CREATE_MS,
    delay = sleepMs,
    listOpenPrUrl,
    createPr,
  } = options;

  const existing = listOpenPrUrl();
  if (existing) {
    console.error(`Reusing open pull request ${existing} for ${head} -> ${base}.`);
    return existing;
  }

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= createAttempts; attempt += 1) {
    const reused = listOpenPrUrl();
    if (reused) {
      console.error(`Reusing open pull request ${reused} for ${head} -> ${base}.`);
      return reused;
    }

    try {
      const url = createPr().trim();
      if (!url) throw new Error("pull request create returned an empty URL");
      if (attempt > 1) {
        console.error(`Opened pull request after ${attempt} create attempt(s): ${url}`);
      }
      return url;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Concurrent create: another attempt (or a prior run) won -- reuse it.
      if (/A pull request already exists/i.test(lastError)) {
        const raced = listOpenPrUrl();
        if (raced) {
          console.error(`Reusing pull request created concurrently: ${raced}`);
          return raced;
        }
      }
      if (!isCreatePullRequestRaceError(lastError) || attempt === createAttempts) {
        throw new Error(lastError);
      }
      const backoff = delayMs * attempt;
      console.error(
        `pull request create race (attempt ${attempt}/${createAttempts}): ${lastError.split("\n")[0]}`,
      );
      delay(backoff);
    }
  }

  throw new Error(lastError);
}

function sleepMs(ms) {
  const seconds = Math.max(0.1, ms / 1000);
  execFileSync("sleep", [String(seconds)], { stdio: "ignore" });
}

function gh(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    const stderr = error?.stderr?.toString?.()?.trim() || "";
    const stdout = error?.stdout?.toString?.()?.trim() || "";
    throw new Error(stderr || stdout || (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * @param {string} path
 * @param {{ method?: string; fields?: Record<string, string> }} [init]
 */
function ghApiJson(path, init = {}) {
  const args = ["api", path];
  if (init.method) {
    args.push("--method", init.method);
  }
  for (const [key, value] of Object.entries(init.fields ?? {})) {
    args.push("-f", `${key}=${value}`);
  }
  return JSON.parse(gh(args));
}

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const values = {
    base: "",
    head: "",
    title: "",
    body: "",
    "expected-sha": "",
    repository: process.env.GITHUB_REPOSITORY || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (!(key in values)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    values[key] = next;
    index += 1;
  }

  for (const key of ["base", "head", "title", "body", "expected-sha", "repository"]) {
    if (!values[key]?.trim()) {
      throw new Error(`Missing required --${key}`);
    }
  }

  return {
    base: values.base,
    head: values.head,
    title: values.title,
    body: values.body,
    expectedSha: values["expected-sha"],
    repository: values.repository,
  };
}

export function main(argv = process.argv.slice(2)) {
  const { base, head, title, body, expectedSha, repository } = parseArgs(argv);

  waitForHeadAhead({
    repository,
    base,
    head,
    expectedSha,
    apiJson(path) {
      return ghApiJson(path);
    },
  });

  const url = openOrReusePullRequest({
    base,
    head,
    listOpenPrUrl() {
      const listed = gh(
        [
          "pr",
          "list",
          "--repo",
          repository,
          "--base",
          base,
          "--head",
          head,
          "--state",
          "open",
          "--json",
          "url",
          "--jq",
          ".[0].url // empty",
        ],
        { allowFailure: true },
      );
      return listed || null;
    },
    createPr() {
      return createPullRequestRest({
        repository,
        base,
        head,
        title,
        body,
        apiJson: ghApiJson,
      });
    },
  });

  process.stdout.write(`${url}\n`);
  return url;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
