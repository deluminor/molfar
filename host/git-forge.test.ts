import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  classify,
  decide,
  forgeOf,
  NO_REMOTE,
  parseGhHosts,
  parseGlabHosts,
  preferredRemote,
  remoteHost,
  UNKNOWN_FORGE,
  type Captured,
  type Run,
} from "./git-forge";
import { parseGhList, parseGlabList } from "./git-request-list";
import { currentRequest, openRequest, requestStatus } from "./git-request";

class Script {
  readonly calls: [string, string[]][] = [];

  constructor(private steps: Partial<Captured>[]) {}

  run: Run = async (program, args) => {
    this.calls.push([program, args]);
    const step = this.steps.shift();
    if (!step) throw new Error(`unexpected ${program} ${args.join(" ")}`);
    return { stdout: step.stdout ?? "", stderr: step.stderr ?? "", ok: step.ok ?? true };
  };
}

const quiet = { ok: false, stdout: "", stderr: "" };

describe("host forge classification", () => {
  it("classifies SaaS hosts without an auth list", () => {
    expect(classify("github.com", [], [])).toBe("github");
    expect(classify("WWW.GitHub.com", [], [])).toBe("github");
    expect(classify("gitlab.com", [], [])).toBe("gitlab");
    expect(classify("www.gitlab.com", [], [])).toBe("gitlab");
    expect(classify("gitlab.monly.io", [], [])).toBe("gitlab");
    expect(classify("git.example.com", [], ["git.example.com"])).toBe("gitlab");
    expect(classify("git.example.com", ["git.example.com"], [])).toBe("github");
    expect(classify("git.example.com", ["git.example.com"], ["git.example.com"])).toBe(
      "unknown",
    );
    expect(classify("git.example.com", [], [])).toBe("unknown");
  });

  it("reads the host from the remote URL forms", () => {
    expect(remoteHost("git@gitlab.com:group/sub/repo.git")).toBe("gitlab.com");
    expect(remoteHost("ssh://git@gitlab.com:2222/group/sub/repo.git")).toBe("gitlab.com");
    expect(remoteHost("https://token@gitlab.monly.io/group/repo.git")).toBe("gitlab.monly.io");
    expect(remoteHost("http://github.com/o/r.git/")).toBe("github.com");
    expect(remoteHost("/srv/git/r.git")).toBeNull();
  });

  it("prefers the upstream remote, then origin, then the first remote", () => {
    expect(preferredRemote("gitlab/feature/name", ["upstream", "origin"])).toBe("gitlab");
    expect(preferredRemote(null, ["upstream", "origin"])).toBe("origin");
    expect(preferredRemote(null, ["fork"])).toBe("fork");
    expect(preferredRemote(null, [])).toBeNull();
  });

  it("classifies only the preferred remote", () => {
    const listing = [
      "origin\tgit@github.com:acme/app.git (fetch)",
      "origin\tgit@github.com:acme/app.git (push)",
      "gitlab\tgit@gitlab.monly.io:acme/app.git (fetch)",
      "",
    ].join("\n");
    expect(decide("gitlab/feature/name", listing, [], [])).toBe("gitlab");
    expect(decide(null, listing, [], [])).toBe("github");
    expect(() => decide(null, "", [], [])).toThrow(NO_REMOTE);
  });

  it("reads auth hosts and does not ask for a token", async () => {
    expect(parseGhHosts('{"hosts":{"GitHub.example.com":[{"state":"success"}]}}')).toEqual([
      "github.example.com",
    ]);
    expect(parseGhHosts("not json")).toEqual([]);
    expect(
      parseGlabHosts(
        [
          "gitlab.example.com",
          "  x gitlab.example.com: API call failed: 401",
          "git.example.com",
          "  ✓ Logged in",
          "! No token",
          "",
        ].join("\n"),
      ),
    ).toEqual(["gitlab.example.com", "git.example.com"]);

    const script = new Script([
      quiet,
      { stdout: "origin\tgit@git.example.com:acme/app.git (fetch)\n" },
      { stdout: '{"hosts":{"git.example.com":[]}}\n', ok: true },
      { stdout: "git.example.com\n", stderr: "401", ok: false },
    ]);
    await expect(forgeOf(script.run)).resolves.toBe("unknown");
    const auth = script.calls.filter(([program]) => program !== "git");
    expect(auth.map(([program]) => program)).toEqual(["gh", "glab"]);
    expect(auth.every(([, args]) => !args.includes("--show-token"))).toBe(true);
    expect(UNKNOWN_FORGE).toContain("gh");
    expect(UNKNOWN_FORGE).toContain("glab");
    expect(UNKNOWN_FORGE).not.toContain("known GitHub host");
  });

  it("does not start gh for a GitLab label", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@gitlab.monly.io:acme/app.git (fetch)\n" },
    ]);
    await expect(forgeOf(script.run)).resolves.toBe("gitlab");
    expect(script.calls.every(([program]) => program === "git")).toBe(true);
  });
});

describe("host merge request commands", () => {
  it("creates a GitHub pull request with --body and does not start glab", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@github.com:acme/app.git (fetch)\n" },
      { stdout: "https://github.com/acme/app/pull/3\n" },
    ]);
    await expect(openRequest(script.run, "Ship", "body", "main", "feature")).resolves.toBe(
      "https://github.com/acme/app/pull/3",
    );
    const create = script.calls.find(([program]) => program === "gh");
    expect(create?.[1]).toEqual([
      "pr",
      "create",
      "--title",
      "Ship",
      "--body",
      "body",
      "--base",
      "main",
      "--head",
      "feature",
    ]);
    expect(script.calls.some(([program]) => program === "glab")).toBe(false);
  });

  it("creates a GitLab merge request and does not start gh", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@gitlab.com:group/app.git (fetch)\n" },
      { stdout: "created\nhttps://gitlab.com/group/app/-/merge_requests/4\n" },
    ]);
    let description = "";
    const run: Run = async (program, args) => {
      if (program === "glab") {
        description = args[args.indexOf("--description-file") + 1] ?? "";
        expect(existsSync(description)).toBe(true);
      }
      return script.run(program, args);
    };
    await expect(openRequest(run, "Ship", "body", "main", "feature")).resolves.toBe(
      "https://gitlab.com/group/app/-/merge_requests/4",
    );
    const create = script.calls.find(([program]) => program === "glab");
    expect(create?.[1].slice(0, 6)).toEqual([
      "mr",
      "create",
      "--yes",
      "--title",
      "Ship",
      "--description-file",
    ]);
    expect(create?.[1].slice(-4)).toEqual(["--source-branch", "feature", "--target-branch", "main"]);
    expect(script.calls.some(([program]) => program === "gh")).toBe(false);
    expect(existsSync(description)).toBe(false);
  });

  it("names GitLab when glab is missing and does not start gh", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@gitlab.com:group/app.git (fetch)\n" },
    ]);
    const run: Run = async (program, args) => {
      if (program === "glab") throw new Error("GitLab CLI (`glab`) is not installed.");
      return script.run(program, args);
    };
    await expect(openRequest(run, "Ship", "body", "main", "feature")).rejects.toThrow(
      /glab|GitLab/,
    );
    expect(script.calls.some(([program]) => program === "gh")).toBe(false);
  });

  it("prefixes a GitLab failure that does not name glab", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@gitlab.com:group/app.git (fetch)\n" },
      { ok: false, stderr: "401 Unauthorized" },
    ]);
    await expect(openRequest(script.run, "Ship", "body", "main", "feature")).rejects.toThrow(
      "GitLab CLI (`glab`) failed. 401 Unauthorized",
    );
    expect(script.calls.some(([program]) => program === "gh")).toBe(false);
  });

  it("rejects an empty title before any command", async () => {
    const script = new Script([]);
    await expect(openRequest(script.run, "  ", "body", "main", "feature")).rejects.toThrow(
      "Pull request title cannot be empty",
    );
    expect(script.calls).toEqual([]);
  });

  it("lists GitLab merge requests by source branch", async () => {
    const script = new Script([
      { stdout: "feature\n" },
      {
        stdout: JSON.stringify([
          { iid: 4, title: "Ship", web_url: "https://gitlab.com/group/app/-/merge_requests/4", state: "opened" },
        ]),
      },
    ]);
    await expect(requestStatus(script.run, "gitlab")).resolves.toEqual({
      number: 4,
      title: "Ship",
      url: "https://gitlab.com/group/app/-/merge_requests/4",
      state: "open",
    });
    expect(script.calls[1]).toEqual([
      "glab",
      ["mr", "list", "--source-branch", "feature", "--all", "--output", "json", "--per-page", "20"],
    ]);
    expect(script.calls.some(([program]) => program === "gh")).toBe(false);
  });

  it("lists GitHub pull requests by source branch instead of pr view", async () => {
    const script = new Script([
      { stdout: "feature\n" },
      { stdout: '{"nameWithOwner":"acme/app"}' },
      {
        stdout: JSON.stringify([
          {
            number: 3,
            title: "Ship",
            url: "https://github.com/acme/app/pull/3",
            state: "OPEN",
            headRepositoryOwner: { login: "acme" },
          },
        ]),
      },
    ]);
    await expect(requestStatus(script.run, "github")).resolves.toMatchObject({
      number: 3,
      state: "open",
    });
    expect(script.calls[2][0]).toBe("gh");
    expect(script.calls[2][1].slice(0, 4)).toEqual(["pr", "list", "--head", "feature"]);
    expect(script.calls.some(([, args]) => args[0] === "pr" && args[1] === "view")).toBe(false);
  });

  it("returns no request when the list command fails", async () => {
    const script = new Script([
      quiet,
      { stdout: "origin\tgit@gitlab.com:group/app.git (fetch)\n" },
      { stdout: "feature\n" },
      { ok: false, stderr: "401 Unauthorized" },
    ]);
    await expect(currentRequest(script.run)).resolves.toBeNull();
    expect(script.calls.some(([program]) => program === "gh")).toBe(false);
    expect(parseGlabList("[]")).toBeNull();
    expect(parseGhList("[]", "acme")).toBeNull();
    expect(
      parseGlabList(
        JSON.stringify([
          { iid: 0, title: "Skip", web_url: "https://gitlab.com/g/a/-/merge_requests/0", state: "opened" },
          { iid: 2, title: "Closed", web_url: "https://gitlab.com/g/a/-/merge_requests/2", state: "closed" },
        ]),
      )?.number,
    ).toBe(2);
  });
});
