import type { NoteComposerCard } from "@/domain/notes/note-card";
import type { Attachment } from "@/domain/session/attachment";
import type { Block } from "@/domain/session/block";
import type { HandoffComposerCard } from "@/domain/session/handoff-card";
import type { QueuedMessage } from "@/domain/session/message-queue";
import type { Session } from "@/domain/session/session";
import type { EditedResendAttempt } from "@/features/sessions/model/edit-last-turn";
import type { pendingComposerSwitch } from "@/features/sessions/model/handoff";
import type { consumeOperatorCommand } from "@/features/sessions/model/operator-command";
import type { SubmitOptions } from "./submit-types";

/** A submission that passed its checks, with everything derived from it. */
export type PreparedSubmission = {
  sessionId: string;
  text: string;
  attachments: Attachment[];
  options?: SubmitOptions;
  /** The session as the turn sees it: draft dropped, build target and edit applied. */
  current: Session;
  draftBlock?: Block;
  editedResend?: EditedResendAttempt | null;
  editedProviderTurnId?: string;
  intent: NonNullable<SubmitOptions["intent"]>;
  approvedPlan?: Block;
  noteCard?: NoteComposerCard;
  handoffCard?: HandoffComposerCard;
  initialWorkCwd: string;
  createDraftWorktree: boolean;
  providerAccountId?: string;
  /** What the user sent, before /operator is taken off. */
  submittedText: string;
  operatorCommand: ReturnType<typeof consumeOperatorCommand>;
  familiar: boolean;
  queuedFamiliarMessage?: QueuedMessage;
  operatorAccess: boolean;
  familiarFirstTurn: boolean;
  promptText: string;
  /** A native slash command goes to the harness as typed. */
  rawCommand: boolean;
  ciContext?: string;
  harnessText: string;
  pendingSwitch: ReturnType<typeof pendingComposerSwitch>;
};
