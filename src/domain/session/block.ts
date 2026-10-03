import type { NoteCardMeta } from "../notes/note-card";
import type { OrchestrationProposal } from "../orchestration/proposal";
import type { ToolPreview, AgentRunMeta } from "./agent-run";
import type { GeneratedImageMeta, Attachment } from "./attachment";
import type {
  PlanBlockMeta,
  HandoffMeta,
  SecondOpinionMeta,
  BtwThread,
  InterjectionMeta,
} from "./block-meta";
import type { TaskListMeta } from "./task-list";
import type { TurnModel, TurnIntent, TurnMetrics } from "./turn";

export type BlockRole =
  | "user"
  | "assistant"
  | "image"
  | "reasoning"
  | "tool"
  | "approval"
  | "tasks"
  | "plan"
  | "system"
  | "handoff";

export type Block = {
  id: string;
  role: BlockRole;
  text: string;
  image?: GeneratedImageMeta;
  attachments?: Attachment[];
  streaming?: boolean;
  /** Epoch ms when this user turn started. */
  startedAt?: number;
  /** How long the agent worked on this user turn, in ms. */
  durationMs?: number;
  /** Stable model label for this turn. Present on newly created user blocks. */
  turnModel?: TurnModel;
  /** Provider turn boundary used to replace this user message, when known. */
  providerTurnId?: string;
  /** User turn saved to the session but not submitted to the harness yet. */
  draft?: boolean;
  /** This user turn activated Vatra app access for its thread. */
  vatra?: boolean;
  /** Pre-rename spelling of `vatra` in saved sessions; read only, never written. */
  monocode?: boolean;
  /** The Plan or Orchestrator mode this user turn was sent in. */
  intent?: Extract<TurnIntent, "plan" | "orchestrate">;
  /** Stable CLI request that submitted this turn, for safe retries. */
  appRequestId?: string;
  /** Provider-reported token metrics for this user turn, when available. */
  turnMetrics?: TurnMetrics;
  tool?: {
    callId?: string;
    title?: string;
    kind?: string;
    status?: string;
    detail?: string;
    preview?: ToolPreview;
    /** Left running by the agent when it yielded; the turn waits on it. */
    background?: boolean;
  };
  approval?: {
    requestId: number;
    decided?: "allow" | "deny" | "cancelled";
  };
  /** Inner activity of a delegated run. Present on Agent/Task tool blocks. */
  agentRun?: AgentRunMeta;
  taskList?: TaskListMeta;
  plan?: PlanBlockMeta;
  orchestration?: OrchestrationProposal;
  /** Parent conversation for an internal orchestration worker. */
  orchestrationLeadId?: string;
  /**
   * A turn the app wrote on the user's behalf to keep an orchestration moving.
   * The harness needs it; the transcript hides it, so a run reads as one
   * conversation rather than the user narrating their own agents.
   */
  internal?: boolean;
  handoff?: HandoffMeta;
  secondOpinion?: SecondOpinionMeta;
  /** Independent read-only side conversations anchored to this user turn. */
  btwThreads?: BtwThread[];
  noteCard?: NoteCardMeta;
  /** Exact CI repair instructions and evidence supplied with this user turn. */
  ciContext?: string;
  /** Mid-turn interjection chrome; system blocks only. Body lives in text. */
  interjection?: InterjectionMeta;
  /**
   * A system row the reader must not miss — an error or an interruption —
   * rather than turn chrome like a status ping. Never folds into the trail.
   */
  notice?: "error" | "interrupt";
};
