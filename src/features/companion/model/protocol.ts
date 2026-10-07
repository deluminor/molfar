import type { FamiliarCard } from "../../familiars/model/familiarCards";
import type { FamiliarStatus } from "../../familiars/model/familiar";
import type {
  BlockRole,
  RuntimeMode,
} from "../../sessions/model/session";
import type {
  UserQuestion,
  UserQuestionReply,
} from "../../sessions/model/userQuestion";

/**
 * The Companion protocol: what a paired phone or tablet sees of this desktop.
 *
 * Bump the version when a field changes meaning or disappears. Adding optional
 * fields does not need a bump; clients ignore what they do not know.
 */
export const COMPANION_PROTOCOL_VERSION = 1;

/** 8×8 SVG path data for each frame, so clients draw the same sprite. */
export type CompanionMascot = { name: string; rest: string; talk: string };

export type CompanionProjectRef = { path: string; name: string };

export type CompanionFamiliar = {
  id: string;
  name: string;
  color: string;
  mascot: CompanionMascot;
  projects: CompanionProjectRef[];
  status: FamiliarStatus;
  activity?: string;
  /** Last visible line of the conversation. */
  preview?: { role: "user" | "assistant"; text: string };
  /** Finished something the user has not looked at yet. */
  unread: boolean;
};

export type CompanionSession = {
  id: string;
  title: string;
  project: CompanionProjectRef;
  harness: string;
  model: string;
  runtimeMode: RuntimeMode;
  status: FamiliarStatus;
  activity?: string;
  branch?: string;
};

export type CompanionProject = CompanionProjectRef & {
  /** Open sessions with a turn in flight. */
  working: number;
  /** Open sessions waiting on an approval, a question or a usage limit. */
  needsYou: number;
};

export type CompanionOverview = {
  protocol: number;
  generatedAt: number;
  familiars: CompanionFamiliar[];
  projects: CompanionProject[];
  /** Open project sessions, busiest first. Familiar conversations and habit runs are left out. */
  sessions: CompanionSession[];
};

export type CompanionBlock = {
  id: string;
  role: BlockRole;
  text: string;
  at?: number;
  streaming?: boolean;
  tool?: { title?: string; kind?: string; status?: string };
  approval?: { requestId: number; decided?: "allow" | "deny" | "cancelled" };
  attachments?: { name: string; kind: string; mimeType: string }[];
  card?: FamiliarCard;
  habit?: { name: string };
  notice?: "error" | "interrupt";
};

export type CompanionQuestion = {
  requestId: number;
  title?: string;
  questions: UserQuestion[];
};

export type CompanionTranscript = {
  sessionId: string;
  title: string;
  /** Changes whenever anything the client renders changes. */
  revision: string;
  busy: boolean;
  status: FamiliarStatus;
  activity?: string;
  harness: string;
  model: string;
  runtimeMode: RuntimeMode;
  question?: CompanionQuestion;
  blocks: CompanionBlock[];
  /** Older blocks exist beyond `limit`. */
  truncated: boolean;
};

export type CompanionUnchanged = { unchanged: true; revision: string };

export type CompanionImage = { name: string; mimeType: string; data: string };

export type CompanionNoteSummary = {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: number;
};

export type CompanionRequest =
  | { action: "overview"; input: Record<string, never> }
  | {
      action: "familiar.transcript";
      input: { familiarId: string; limit?: number; ifRevision?: string };
    }
  | {
      action: "familiar.send";
      input: { familiarId: string; text: string; images?: CompanionImage[] };
    }
  | {
      action: "session.transcript";
      input: { sessionId: string; limit?: number; ifRevision?: string };
    }
  | {
      action: "session.send";
      input: { sessionId: string; text: string; images?: CompanionImage[] };
    }
  | { action: "session.stop"; input: { sessionId: string } }
  | {
      action: "session.mode";
      input: { sessionId: string; runtimeMode: RuntimeMode };
    }
  | {
      action: "approval.respond";
      input: { sessionId: string; requestId: number; decision: "allow" | "deny" };
    }
  | {
      action: "question.answer";
      input: { sessionId: string; requestId: number; reply: UserQuestionReply };
    }
  | { action: "notes.list"; input: { query?: string } }
  | { action: "notes.read"; input: { id: string } }
  | {
      action: "notes.create";
      input: { title?: string; body: string; tags?: string[] };
    };

export type CompanionAction = CompanionRequest["action"];
