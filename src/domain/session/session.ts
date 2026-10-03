import type { NoteComposerCard } from "../notes/note-card";
import type { HarnessId } from "../harness/harness";
import type { InboxAskContext } from "../work-items/inbox-ask-context";
import type { InboxComposerCard } from "../work-items/inbox-card";
import type { LinkedWorkItemUpdateCard } from "../work-items/linked-activity";
import type { Block } from "./block";
import type { ContextUsage } from "./context-usage";
import type { HandoffComposerCard } from "./handoff-card";
import type {
  QueuedMessage,
  MessageQueueStatus,
  UsageLimit,
} from "./message-queue";
import type { RuntimeMode } from "./runtime-mode";
import type { UserQuestionPrompt } from "./user-question";

/** One GitHub issue or pull request associated with a coding session. */
export type LinkedWorkItem = {
  kind: "issue" | "pr";
  repo: string;
  number: number;
  url: string;
};

export type WorkspaceMode = "current" | "worktree";

export type Session = {
  /** Receipt for an acknowledged floating-composer handoff. */
  quickLaunchAccepted?: boolean;
  /** Internal worker: displayed in its lead's panel rather than a workspace tab. */
  orchestrationLeadId?: string;
  /** Temporary Inbox conversation: shares the runtime, never saved as a session. */
  inboxAsk?: InboxAskContext;
  id: string;
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
  title: string;
  /** Project / working directory for this session. */
  cwd: string;
  blocks: Block[];
  /** True while a harness turn is in flight. */
  busy?: boolean;
  /**
   * What the live turn is waiting on after the agent yielded with work still
   * running in the background. In-memory only.
   */
  backgroundTasks?: string[];
  /** Follow-ups waiting for current turn. In-memory only. */
  queuedMessages?: QueuedMessage[];
  /** Paused after user stops current turn; resuming waits for continued turn. */
  queueStatus?: MessageQueueStatus;
  /** Prevent auto-dispatch while this queued row is being edited. In-memory only. */
  editingQueuedMessageId?: string;
  /** Last turn hit a provider usage limit; cleared by the next send. In-memory only. */
  usageLimit?: UsageLimit;
  /** Provider-side conversation id (Cursor ACP session id). */
  providerSessionId?: string;
  /** Named local credential profile used by Claude or Codex. */
  providerAccountId?: string;
  /** Context-window level reported by the harness. Absent until it reports. */
  context?: ContextUsage;
  /**
   * Composer switched providers, but the previous child is still live.
   * Handoff runs on the next send, not on picker change.
   */
  pendingSwitch?: PendingHarnessSwitch;
  /** Last known branch in the session's working copy. */
  branch?: string;
  /** Selected working copy; cwd remains the project identity. */
  worktreeCwd?: string;
  /** Blank-composer choice; consumed when the first turn starts. */
  workspaceMode?: WorkspaceMode;
  /** Base ref for a worktree that will be created on first send. */
  worktreeBase?: string;
  /** Internal guard while the first turn creates its selected worktree. */
  worktreePreparing?: boolean;
  /** Select a working copy before continuing after the previous one was deleted. */
  worktreeRemoved?: boolean;
  /** One-shot composer text when opening a session from Inbox. */
  composerSeed?: string;
  /** Inbox issue/PR chip shown above the composer. In-memory, one-shot. */
  inboxCard?: InboxComposerCard;
  /** GitHub issue or pull request shown on the persisted session card. */
  linkedWorkItem?: LinkedWorkItem;
  /** Automation that created or last launched this session. */
  automationId?: string;
  /** New linked-item activity shown above the composer. In-memory, one-shot. */
  linkedWorkItemUpdateCard?: LinkedWorkItemUpdateCard;
  /** Note chip shown above the composer. In-memory, one-shot. */
  noteCard?: NoteComposerCard;
  /** Handoff chip shown above the composer. In-memory, one-shot. */
  handoffCard?: HandoffComposerCard;
  /**
   * Live clarifying questions from AskUserQuestion / ask_question / etc.
   * In-memory; request ids do not survive restarts.
   */
  pendingQuestion?: UserQuestionPrompt;
};

export type PendingHarnessSwitch = {
  from: HarnessId;
  fromModel: string;
  fromSettings: Record<string, string>;
  fromProviderSessionId?: string;
  fromProviderAccountId?: string;
};
