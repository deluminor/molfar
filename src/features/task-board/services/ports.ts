import type { ControlOutcome } from "../../orchestration/model/orchestration";
import type { LaunchChoice } from "../../sessions/model/launch-choice";
import type { TaskGitClient } from "../api/git-client";
import type { TaskBoardClient } from "../api/task-board-client";
import type { AgentStage } from "../types/stage";

export type BoardStorePort = TaskBoardClient;
export type GitPort = TaskGitClient;

export type StageLaunch = {
  /** Chosen and stored on the run before launch, so a cancel can always find it. */
  sessionId: string;
  cardId: string;
  stage: AgentStage;
  /** The card's worktree; the session runs there and nowhere else. */
  cwd: string;
  projectCwd: string;
  title: string;
  choice: LaunchChoice;
};

export type StageSessionState = "busy" | "idle" | "missing";

/** The running app's session runtime, as the board engine needs it. */
export type SessionPort = {
  /**
   * Creates a hidden, card-linked session and submits the prompt in one step,
   * so the idle-session detacher can never drop it in between. Resolves once
   * the session exists; a rejected submission is reported only through
   * `onSettled`. Throws only when no session could be created.
   * `onSettled` fires exactly once; its `text` is the full assistant text of
   * the turn, captured at settlement before the session can be detached.
   */
  launch(
    launch: StageLaunch,
    prompt: string,
    onSettled: (outcome: ControlOutcome) => void,
  ): Promise<void>;
  state(sessionId: string): StageSessionState;
  /** Full assistant text of the latest turn, while the session is still loaded. */
  turnText(sessionId: string): string;
  /** A pending approval or clarifying question is waiting on the user. */
  needsInput(sessionId: string): boolean;
  stop(sessionId: string): Promise<void>;
};

export type BoardNotice = {
  cardId: string;
  title: string;
  body: string;
  kind: "gate" | "failed" | "stalled";
};

export type NotifyPort = { notify(notice: BoardNotice): void };

export type EnginePorts = {
  /** Rail projects; cards may only target these. */
  projects: () => readonly string[];
  store: BoardStorePort;
  git: GitPort;
  sessions: SessionPort;
  notify: NotifyPort;
  now: () => number;
  newId: () => string;
};
