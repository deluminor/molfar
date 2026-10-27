import type { HarnessId } from "@/domain/harness/harness";
import type { TurnMetrics } from "@/domain/session/turn";
import type { ActivityPhaseKind } from "@/features/sessions/model/transcript-activity";

export type MobileStep = { id: string; label: string; failed?: boolean };
export type MobilePhase = {
  id: string;
  kind: ActivityPhaseKind;
  title: string;
  steps: MobileStep[];
};
/** What an opened fold holds, in order: the agent's notes between its work. */
export type MobileFoldEntry =
  | { type: "prose"; id: string; text: string }
  | ({ type: "phase" } & MobilePhase);
export type MobileTurnItem =
  | {
      type: "user";
      id: string;
      text: string;
      at?: number;
      reaction?: string;
      emojiOnly?: boolean;
      attachments?: number;
      /** Another message follows straight on, so this one drops its time. */
      compact?: boolean;
    }
  | { type: "text"; id: string; text: string; streaming?: boolean }
  /** The turn's status line: the fold line, or a Familiar's signature. */
  | {
      type: "header";
      id: string;
      live: boolean;
      /** Shown as is. Without one the phone formats the clock itself. */
      label?: string;
      waiting?: string;
      startedAt?: number;
      durationMs?: number;
      model?: string;
      harness?: HarnessId;
      /** The work the line folds away; empty when there is none to open. */
      entries: MobileFoldEntry[];
    }
  /** Work left open in the turn: live, or after the last answer. */
  | { type: "work"; id: string; live: boolean; phases: MobilePhase[] }
  | { type: "notice"; id: string; text: string; error?: boolean };

export type MobileTurn = {
  id: string;
  /** A day stamp above the turn, for a Familiar's conversation kept over days. */
  stampAt?: number;
  items: MobileTurnItem[];
  /** When the answer landed, for the line under a settled turn. */
  completedAt?: number;
  footer?: boolean;
  /** What the footer's copy button copies: the turn's replies, as on desktop. */
  copyText?: string;
  /** Token accounting for the footer's metrics button; Familiars leave it out. */
  metrics?: TurnMetrics;
  durationMs?: number;
};
