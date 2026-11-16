import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import type { GitSnapshot } from "@/platform/tauri/fs";
import type { BoardNotice, EnginePorts, GitPort, SessionPort, StageLaunch, StageSessionState } from "../ports";
import { createFakeStore } from "./fake-store";

type Launched = {
  sessionId: string;
  launch: StageLaunch;
  prompt: string;
  settle: (outcome: ControlOutcome) => void;
};

/** A git checkout per worktree path: HEAD plus dirty-file status. */
function createFakeGit() {
  const checkouts = new Map<string, GitSnapshot>();
  const calls: string[] = [];
  let commits = 0;
  const sha = () => (++commits).toString(16).padStart(40, "0");
  let edits = 0;
  const at = (path: string) => checkouts.get(path) ?? { head: "f".repeat(40), porcelain: "", fingerprint: "clean" };

  const git: GitPort = {
    defaultBranch: async () => "main",
    createWorktree: async (_project, branch, _base, existing = false) => {
      const path = `/worktrees/${branch}`;
      if (checkouts.has(path)) throw new Error(`${path} already exists. Choose another branch name.`);
      checkouts.set(path, { head: "b".repeat(40), porcelain: "", fingerprint: "clean" });
      calls.push(`worktree ${branch}${existing ? " (existing)" : ""}`);
      return { path, branch };
    },
    findWorktree: async (_project, branch) => {
      const path = `/worktrees/${branch}`;
      return checkouts.has(path) ? { path, branch } : null;
    },
    removeWorktree: async (_project, path, force) => {
      calls.push(`remove ${path}${force ? " --force" : ""}`);
      checkouts.delete(path);
    },
    removeBranch: async (_project, branch) => {
      calls.push(`delete-branch ${branch}`);
      return true;
    },
    snapshot: async (cwd) => {
      if (cwd.startsWith("/not-git")) throw new Error("not a git repository");
      return { ...at(cwd) };
    },
    rangeDiff: async (_cwd, base) => ({ base, head: "HEAD", commitSummary: "", diffSummary: "", diffPatch: "" }),
    push: async (cwd) => {
      calls.push(`push ${cwd}`);
    },
    githubRepo: async () => "acme/app",
    createPullRequest: async (_cwd, input) => {
      calls.push(`pr ${input.title} → ${input.base} | ${input.body}`);
      return "https://github.com/acme/app/pull/42";
    },
    squashMerge: async (_cwd, repo, number) => {
      calls.push(`merge ${repo}#${number}`);
    },
  };

  const commit = (path: string) => checkouts.set(path, { head: sha(), porcelain: "", fingerprint: "clean" });
  const dirty = (path: string) =>
    checkouts.set(path, { ...at(path), porcelain: " M src/app.ts\n", fingerprint: `edit-${++edits}` });
  return { git, calls, commit, dirty };
}

function createFakeSessions() {
  const launched: Launched[] = [];
  const states = new Map<string, StageSessionState>();
  const stopped: string[] = [];

  const sessions: SessionPort = {
    launch: async (launch, prompt, onSettled) => {
      const { sessionId } = launch;
      states.set(sessionId, "busy");
      launched.push({
        sessionId,
        launch,
        prompt,
        settle: (outcome) => {
          states.set(sessionId, "idle");
          onSettled(outcome);
        },
      });
    },
    state: (sessionId) => states.get(sessionId) ?? "missing",
    turnText: () => "",
    needsInput: () => false,
    stop: async (sessionId) => {
      stopped.push(sessionId);
    },
  };
  return { sessions, launched, states, stopped };
}

export function createFakePorts() {
  let time = 1_000;
  const clock = () => time;
  const board = createFakeStore(clock);
  const git = createFakeGit();
  const sessions = createFakeSessions();
  const notices: BoardNotice[] = [];
  let ids = 0;

  const ports: EnginePorts = {
    projects: () => ["/code/app", "/not-git/app", "remote://host/app"],
    store: board.store,
    git: git.git,
    sessions: sessions.sessions,
    notify: { notify: (notice) => notices.push(notice) },
    now: clock,
    newId: () => `id-${++ids}`,
  };

  return {
    ports,
    board,
    git,
    sessions,
    notices,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

export const block = (kind: string, body: string): string =>
  `<<<MOLFAR:${kind}>>>\n${body}\n<<<END:${kind}>>>`;
