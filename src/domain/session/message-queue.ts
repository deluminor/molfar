import type { NoteComposerCard } from "../notes/note-card";
import type { Attachment } from "./attachment";
import type { FamiliarSessionCompletion } from "./familiar-session";
import type { HandoffComposerCard } from "./handoff-card";
import type { TurnIntent } from "./turn";

export type QueuedMessage = {
  id: string;
  /** User bubble already shown optimistically in a Familiar's conversation. */
  blockId?: string;
  text: string;
  attachments: Attachment[];
  noteCard?: NoteComposerCard;
  handoffCard?: HandoffComposerCard;
  intent?: TurnIntent;
  /** An app notification that must wait for an idle Familiar, never steer its work. */
  familiarSessionCompletion?: FamiliarSessionCompletion;
  /** Delivery failed; the message remains available to retry or edit. */
  error?: string;
};

export type MessageQueueStatus = "active" | "paused" | "resuming";
/** The provider stopped the last turn at a usage limit. */
export type UsageLimit = {
  /** Epoch ms when the provider's window resets, once known. */
  resetsAt?: number;
  /** Send a continue turn once the window resets. */
  resumeAtReset?: boolean;
};
