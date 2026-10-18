import type { ArtifactCard } from "../artifacts/artifact";
import type { FamiliarCard } from "../familiars/familiar-card";
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
import type { FamiliarSessionCompletion, FamiliarSpawnedSession } from "./familiar-session";
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
  /** Epoch ms when this message joined a turn that was already running. */
  sentAt?: number;
  /** Stable model label for this turn. Present on newly created user blocks. */
  turnModel?: TurnModel;
  /** Provider turn boundary used to replace this user message, when known. */
  providerTurnId?: string;
  /** User turn saved to the session but not submitted to the harness yet. */
  draft?: boolean;
  /** This user turn activated MOLFAR app access for its thread. */
  molfar?: boolean;
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
    /** Every file in a multi-file edit, retained for checkpoint recovery. */
    paths?: string[];
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
  /** Hidden app prompt that starts a separate completion report in a Familiar chat. */
  familiarSessionCompletion?: FamiliarSessionCompletion;
  /** Accepted session launches, kept on the originating user turn. */
  familiarSpawnedSessions?: FamiliarSpawnedSession[];
  handoff?: HandoffMeta;
  secondOpinion?: SecondOpinionMeta;
  /** Independent read-only side conversations anchored to this user turn. */
  btwThreads?: BtwThread[];
  noteCard?: NoteCardMeta;
  /** Saved artifacts attached to this turn; their bodies live outside chat. */
  artifactCards?: ArtifactCard[];
  /** Exact CI repair instructions and evidence supplied with this user turn. */
  ciContext?: string;
  /** Mid-turn interjection chrome; system blocks only. Body lives in text. */
  interjection?: InterjectionMeta;
  /**
   * A system row the reader must not miss — an error or an interruption —
   * rather than turn chrome like a status ping. Never folds into the trail.
   */
  notice?: "error" | "interrupt";
  statusKey?: string;
  /** Posted to a Familiar's chat by one of its habits, outside any turn. */
  familiarHabit?: { id: string; name: string; at: number };
  /** A card a Familiar put in its chat; see `domain/familiars/familiar-card`. */
  familiarCard?: FamiliarCard;
  /**
   * The emoji a Familiar answered this user message with. Drawn from its reply
   * when the chat renders; see `features/familiars/model/familiarReaction`.
   */
  familiarReaction?: string;
};
