import { execFile } from "node:child_process";

export type Captured = { stdout: string; stderr: string; ok: boolean };
export type Run = (program: string, args: string[]) => Promise<Captured>;
export type ForgeName = "github" | "gitlab" | "unknown";

export const NO_REMOTE =
  "No git remote to open a merge request or pull request against.";
export const UNKNOWN_FORGE =
  "Could not tell whether this remote is GitHub or GitLab. Install and authenticate gh or glab for this host.";

const GH_AUTH = ["auth", "status", "--json", "hosts"];
const GLAB_AUTH = ["auth", "status", "--all"];

export function classify(
  host: string,
  githubHosts: string[],
  gitlabHosts: string[],
): ForgeName {
  const name = normalize(host);
  if (name === "github.com" || name === "www.github.com") return "github";
  if (name === "gitlab.com" || name === "www.gitlab.com") return "gitlab";
  const onGithub = listed(githubHosts, name);
  const onGitlab = listed(gitlabHosts, name);
  if (onGithub && onGitlab) return "unknown";
  if (onGithub) return "github";
  if (onGitlab || name === "gitlab" || name.startsWith("gitlab.")) return "gitlab";
  return "unknown";
}

export function remoteHost(url: string): string | null {
  let remote = url.trim().replace(/\/+$/, "");
  if (remote.endsWith(".git")) remote = remote.slice(0, -4);
  let host: string;
  const scheme = /^(?:https?|ssh):\/\/([^/]+)/.exec(remote);
  if (scheme) {
    host = scheme[1].split("@").pop()?.split(":")[0] ?? "";
  } else {
    const colon = remote.indexOf(":");
    if (colon < 0) return null;
    const userHost = remote.slice(0, colon);
    if (userHost.includes("/")) return null;
    host = userHost.split("@").pop() ?? "";
  }
  host = normalize(host);
  return host || null;
}

export function preferredRemote(
  upstream: string | null | undefined,
  names: string[],
): string | null {
  const trimmed = upstream?.trim() ?? "";
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    const remote = trimmed.slice(0, slash).trim();
    if (remote) return remote;
  }
  if (names.includes("origin")) return "origin";
  return names.find((name) => name.length > 0) ?? null;
}

export function parseRemotes(text: string): [string, string][] {
  const remotes: [string, string][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const split = line.search(/[\t ]/);
    if (split <= 0) continue;
    const name = line.slice(0, split).trim();
    if (!name || remotes.some(([seen]) => seen === name)) continue;
    const rest = line.slice(split).trim();
    const url = rest.replace(/ \((?:fetch|push)\)$/, "").trim();
    if (url) remotes.push([name, url]);
  }
  return remotes;
}

export function parseGhHosts(text: string): string[] {
  try {
    const value = JSON.parse(text.trim()) as unknown;
    const hosts =
      value && typeof value === "object" && "hosts" in value
        ? (value as { hosts: unknown }).hosts
        : value;
    const names = Array.isArray(hosts)
      ? hosts.flatMap((item) => {
          if (typeof item === "string") return [item];
          if (item && typeof item === "object" && "host" in item) {
            const host = (item as { host: unknown }).host;
            return typeof host === "string" ? [host] : [];
          }
          return [];
        })
      : hosts && typeof hosts === "object"
        ? Object.keys(hosts)
        : [];
    return names.map((name) => name.trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export function parseGlabHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith(" ") || line.startsWith("\t")) continue;
    const name = normalize(line.trim());
    if (!name || /\s/.test(line.trim())) continue;
    if (name.includes(".") || name === "gitlab") hosts.push(name);
  }
  return hosts;
}

export function decide(
  upstream: string | null,
  listing: string,
  githubHosts: string[],
  gitlabHosts: string[],
): ForgeName {
  const remotes = parseRemotes(listing);
  const preferred = preferredRemote(
    upstream,
    remotes.map(([name]) => name),
  );
  if (!preferred) throw new Error(NO_REMOTE);
  const url = remotes.find(([name]) => name === preferred)?.[1] ?? "";
  const host = remoteHost(url);
  if (!host) return "unknown";
  return classify(host, githubHosts, gitlabHosts);
}

/** Labels only. A checkout with no remote is `unknown`, not an error. */
export async function forgeName(run: Run): Promise<ForgeName> {
  try {
    return await forgeOf(run);
  } catch (error) {
    if (error instanceof Error && error.message === NO_REMOTE) return "unknown";
    throw error;
  }
}

export async function forgeOf(run: Run): Promise<ForgeName> {
  const upstream = await gitText(run, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
  const listing = await gitText(run, ["remote", "-v"]);
  const remotes = parseRemotes(listing);
  const preferred = preferredRemote(
    upstream,
    remotes.map(([name]) => name),
  );
  if (!preferred) throw new Error(NO_REMOTE);
  const host = remoteHost(remotes.find(([name]) => name === preferred)?.[1] ?? "");
  if (!host) return "unknown";
  if (host === "github.com" || host === "www.github.com") return "github";
  if (host === "gitlab.com" || host === "www.gitlab.com") return "gitlab";
  if (host === "gitlab" || host.startsWith("gitlab.")) return "gitlab";
  const github = parseGhHosts(await authText(run, "gh", GH_AUTH, false));
  const gitlab = parseGlabHosts(await authText(run, "glab", GLAB_AUTH, true));
  return classify(host, github, gitlab);
}

export async function runCli(
  cwd: string,
  program: string,
  args: string[],
): Promise<Captured> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (program === "gh") {
    env.GH_PROMPT_DISABLED = "1";
    env.GH_PAGER = "cat";
    env.GIT_PAGER = "cat";
  }
  try {
    const { stdout, stderr } = await execFile(program, args, {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
      env,
    });
    return { stdout: String(stdout), stderr: String(stderr ?? ""), ok: true };
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (failed.code === "ENOENT") throw new Error(missing(program));
    return {
      stdout: String(failed.stdout ?? ""),
      stderr: String(failed.stderr ?? failed.message ?? ""),
      ok: false,
    };
  }
}

export function missing(program: string): string {
  if (program === "gh") return "GitHub CLI (`gh`) is not installed.";
  if (program === "glab") return "GitLab CLI (`glab`) is not installed.";
  return `${program} is not installed.`;
}

function normalize(host: string): string {
  return host.trim().replace(/\.+$/, "").toLowerCase();
}

function listed(hosts: string[], host: string): boolean {
  return hosts.some((item) => normalize(item) === host);
}

async function gitText(run: Run, args: string[]): Promise<string> {
  try {
    const captured = await run("git", args);
    return captured.ok ? captured.stdout : "";
  } catch {
    return "";
  }
}

async function authText(
  run: Run,
  program: string,
  args: string[],
  failedOk: boolean,
): Promise<string> {
  try {
    const captured = await run(program, args);
    if (captured.ok || failedOk) return `${captured.stdout}\n${captured.stderr}`;
  } catch {
    return "";
  }
  return "";
}
