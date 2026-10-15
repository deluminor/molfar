export type BoardColumn =
  | "backlog"
  | "grill"
  | "plan_approval"
  | "implement"
  | "code_review"
  | "final_review"
  | "rework"
  | "done";

export type RunState = "idle" | "queued" | "running" | "failed";

/** Mirrors `task_board::types::Card` in Rust. `updatedAt` is the CAS token. */
export type Card = {
  id: string;
  number: number;
  projectCwd: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  columnId: BoardColumn;
  runState: RunState;
  position: number;
  baseRef: string | null;
  baseSha: string | null;
  branch: string | null;
  worktreePath: string | null;
  grillRound: number;
  reworkCycle: number;
  overridesJson: string;
  lastError: string | null;
  deliveryJson: string | null;
  archived: boolean;
  queuedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CardCreate = {
  id: string;
  projectCwd: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  baseRef: string | null;
};

/** `null` clears a nullable column; an absent key keeps it. */
export type CardPatch = Partial<
  Pick<
    Card,
    | "title"
    | "description"
    | "acceptanceCriteria"
    | "columnId"
    | "runState"
    | "position"
    | "grillRound"
    | "reworkCycle"
    | "overridesJson"
    | "archived"
    | "baseRef"
    | "baseSha"
    | "branch"
    | "worktreePath"
    | "lastError"
    | "deliveryJson"
  >
>;

export type DeliveryMethod = "pr" | "merge" | "keep";

export type Delivery = {
  method: DeliveryMethod;
  prUrl?: string;
  /** The pull request was squash-merged; a retried delivery must not merge again. */
  merged?: boolean;
  deliveredAt: number;
};
