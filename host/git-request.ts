import { randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GitPr } from "../src/domain/git/pull-request";
import {
  forgeOf,
  missing,
  type Captured,
  type ForgeName,
  type Run,
  UNKNOWN_FORGE,
} from "./git-forge";
import { parseGhList, parseGlabList } from "./git-request-list";

export async function openRequest(
  run: Run,
  title: unknown,
  body: unknown,
  base: unknown,
  head: unknown,
): Promise<string> {
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    typeof base !== "string" ||
    typeof head !== "string" ||
    [title, body, base, head].some((value) => value.length > 100_000)
  ) {
    throw new Error("Invalid pull request");
  }
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Pull request title cannot be empty");
  const forge = await forgeOf(run);
  if (forge === "unknown") throw new Error(UNKNOWN_FORGE);
  if (forge === "gitlab") return gitlabCreate(run, trimmed, body, base.trim(), head.trim());
  return githubCreate(run, trimmed, body, base.trim(), head.trim());
}

export async function currentRequest(run: Run): Promise<GitPr | null> {
  let forge: ForgeName;
  try {
    forge = await forgeOf(run);
  } catch {
    return null;
  }
  return requestStatus(run, forge);
}

export async function requestStatus(run: Run, forge: ForgeName): Promise<GitPr | null> {
  if (forge === "unknown") return null;
  const branch = (await gitText(run, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (!branch || branch === "HEAD") return null;
  try {
    if (forge === "gitlab") {
      const text = await commandText(
        "glab",
        await run("glab", [
          "mr",
          "list",
          "--source-branch",
          branch,
          "--all",
          "--output",
          "json",
          "--per-page",
          "20",
        ]),
      );
      return parseGlabList(text);
    }
    const repo = JSON.parse(
      await commandText("gh", await run("gh", ["repo", "view", "--json", "nameWithOwner"])),
    ) as { nameWithOwner?: string };
    const owner = repo.nameWithOwner?.split("/")[0]?.trim();
    if (!owner || repo.nameWithOwner?.includes(" ") || !repo.nameWithOwner?.includes("/"))
      return null;
    const text = await commandText(
      "gh",
      await run("gh", [
        "pr",
        "list",
        "--head",
        branch,
        "--json",
        "number,title,url,state,headRepositoryOwner",
        "--limit",
        "20",
        "--state",
        "all",
      ]),
    );
    return parseGhList(text, owner);
  } catch {
    return null;
  }
}

async function githubCreate(
  run: Run,
  title: string,
  body: string,
  base: string,
  head: string,
): Promise<string> {
  let captured: Captured;
  try {
    captured = await run("gh", [
      "pr",
      "create",
      "--title",
      title,
      "--body",
      body,
      "--base",
      base,
      "--head",
      head,
    ]);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : missing("gh"));
  }
  if (!captured.ok) throw new Error(detail("gh", captured));
  return urlFrom(captured.stdout, "gh returned no pull request URL");
}

async function gitlabCreate(
  run: Run,
  title: string,
  body: string,
  base: string,
  head: string,
): Promise<string> {
  const path = join(tmpdir(), `molfar-pr-${randomBytes(8).toString("hex")}.md`);
  await writeFile(path, body.trim());
  try {
    let captured: Captured;
    try {
      captured = await run("glab", [
        "mr",
        "create",
        "--yes",
        "--title",
        title,
        "--description-file",
        path,
        "--source-branch",
        head,
        "--target-branch",
        base,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : missing("glab");
      throw new Error(failGitlab(message));
    }
    if (!captured.ok) throw new Error(failGitlab(detail("glab", captured)));
    return urlFrom(captured.stdout, "glab returned no merge request URL");
  } finally {
    await rm(path, { force: true });
  }
}

async function gitText(run: Run, args: string[]): Promise<string> {
  try {
    const captured = await run("git", args);
    return captured.ok ? captured.stdout : "";
  } catch {
    return "";
  }
}

async function commandText(program: string, captured: Captured): Promise<string> {
  if (!captured.ok) throw new Error(detail(program, captured));
  const text = captured.stdout.trim();
  if (!text) throw new Error(`${program} returned no output`);
  return text;
}

function detail(program: string, captured: Captured): string {
  const stderr = captured.stderr.trim();
  if (stderr) return stderr;
  const stdout = captured.stdout.trim();
  if (stdout) return stdout;
  return `${program} failed`;
}

function urlFrom(stdout: string, empty: string): string {
  const url = [...stdout.split("\n")]
    .reverse()
    .map((line) => line.trim())
    .find((line) => line.startsWith("http://") || line.startsWith("https://"));
  if (url) return url;
  if (!stdout.trim()) throw new Error(empty);
  throw new Error(stdout.trim());
}

function failGitlab(detailText: string): string {
  const lower = detailText.toLowerCase();
  if (lower.includes("glab") || detailText.includes("GitLab")) return detailText;
  return `GitLab CLI (\`glab\`) failed. ${detailText}`;
}
