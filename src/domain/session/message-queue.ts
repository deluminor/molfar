import type { NoteComposerCard } from "../notes/note-card";
import type { Attachment } from "./attachment";
import type { HandoffComposerCard } from "./handoff-card";
import type { TurnIntent } from "./turn";

export type QueuedMessage = {
  id: string;
  text: string;
  attachments: Attachment[];
  noteCard?: NoteComposerCard;
  handoffCard?: HandoffComposerCard;
  intent?: TurnIntent;
};

export type MessageQueueStatus = "active" | "paused" | "resuming";
/** The provider stopped the last turn at a usage limit. */
export type UsageLimit = {
  /** Epoch ms when the provider's window resets, once known. */
  resetsAt?: number;
  /** Send a continue turn once the window resets. */
  resumeAtReset?: boolean;
};
