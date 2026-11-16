import {
  CheckCheck,
  CheckCircle,
  Eye,
  GitCompare,
  Clock,
  GitPullRequest,
  Inbox,
  Pause,
  RotateCcw,
  Sparkles,
  Terminal,
  type IconComponent,
} from "@/shared/ui/icons";
import type { BoardActionType } from "../model/transitions";
import type { BoardColumn } from "../types/card";

/** queue: waits to start · agent: a session works · gate: waits on you · terminal: finished. */
export type ColumnKind = "queue" | "agent" | "gate" | "terminal";

export const COLUMN_LOOK: Record<BoardColumn, { icon: IconComponent; kind: ColumnKind }> = {
  backlog: { icon: Inbox, kind: "queue" },
  grill: { icon: Sparkles, kind: "agent" },
  plan_approval: { icon: CheckCheck, kind: "gate" },
  implement: { icon: Terminal, kind: "agent" },
  code_review: { icon: GitCompare, kind: "agent" },
  final_review: { icon: Eye, kind: "gate" },
  rework: { icon: RotateCcw, kind: "agent" },
  done: { icon: CheckCircle, kind: "terminal" },
};

/** Icon chip and accent per column kind; colour always pairs with an icon and a word. */
export const KIND_TONE: Record<ColumnKind, string> = {
  queue: "bg-content/[0.07] text-content/60",
  agent: "bg-accent/15 text-accent",
  gate: "bg-amber-300/12 text-amber-300",
  terminal: "bg-emerald-400/12 text-emerald-300",
};

/** What a drop on a column does, shown while dragging. */
export const DROP_LABEL: Partial<Record<BoardActionType, string>> = {
  start: "Drop to start grill",
  approvePlan: "Drop to approve the plan",
  requestChanges: "Drop to request plan changes",
  rework: "Drop to pick findings for rework",
  deliver: "Drop to choose a delivery",
  back: "Drop to move back",
};

/** Fills the model-picker slot of columns no agent works, saying who acts there. */
export const COLUMN_NOTE: Partial<Record<BoardColumn, { icon: IconComponent; lead: string; rest: string }>> = {
  backlog: { icon: Pause, lead: "Not started", rest: "drag to Grill to begin" },
  plan_approval: { icon: Clock, lead: "Your turn", rest: "approve or request changes" },
  final_review: { icon: Clock, lead: "Your turn", rest: "deliver or send to rework" },
  done: { icon: GitPullRequest, lead: "Shipped", rest: "as a PR, merge or branch" },
};

/** Note frame per column kind, matching the model chip's height. */
export const NOTE_TONE: Record<ColumnKind, string> = {
  queue: "border-stroke text-content/45",
  agent: "border-stroke text-content/45",
  gate: "border-amber-300/20 bg-amber-300/[0.05] text-amber-200/70",
  terminal: "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200/65",
};
