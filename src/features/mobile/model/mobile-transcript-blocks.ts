import { familiarWorkStatus } from "@/features/sessions/model/familiar-work-status";
import { visibleUserPrompt } from "@/features/orchestration/model/orchestration";
import { isEmojiOnlyMessage } from "@/features/sessions/model/emoji-message";
import {
  isOperatorUserTurn,
  operatorUserPrompt,
} from "@/features/sessions/model/operator-command";
import type { Block } from "@/domain/session/block";
import {
  activityPhaseTitle,
  buildActivityPhases,
  isNoticeBlock,
  isProseBlock,
  needsApproval,
  toolCallLabel,
  toolCallState,
  isToolBlock,
  proseSummary,
} from "@/features/sessions/model/transcript-activity";

import type { TurnItem as TranscriptItem } from "@/features/sessions/model/transcript-activity";
import type {
  MobileFoldEntry,
  MobilePhase,
  MobileTurnItem,
} from "../types/transcript";

const MAX_STEPS = 40;

export function blockItem(block: Block, cwd: string): MobileTurnItem | null {
  if (block.role === "user") {
    const text = visibleUserPrompt(
      isOperatorUserTurn(block) ? operatorUserPrompt(block) : block.text,
    );
    if (!text && !block.attachments?.length) return null;
    return {
      type: "user",
      id: block.id,
      text,
      at: block.sentAt ?? block.startedAt,
      ...(block.familiarReaction ? { reaction: block.familiarReaction } : {}),
      ...(text && isEmojiOnlyMessage(text) ? { emojiOnly: true } : {}),
      ...(block.attachments?.length
        ? { attachments: block.attachments.length }
        : {}),
    };
  }
  if (isProseBlock(block))
    return {
      type: "text",
      id: block.id,
      text: block.text,
      ...(block.streaming ? { streaming: true } : {}),
    };
  if (block.role === "plan" && !block.orchestration && block.text.trim())
    return { type: "text", id: block.id, text: block.text };
  if (block.role === "tasks" && block.taskList?.items.length)
    return {
      type: "text",
      id: block.id,
      text: block.taskList.items
        .map(
          (task) =>
            `- ${task.status === "completed" ? `~~${task.text}~~` : task.text}`,
        )
        .join("\n"),
    };
  if (isToolBlock(block))
    return {
      type: "notice",
      id: block.id,
      text: needsApproval(block)
        ? `Waiting for approval on desktop: ${toolCallLabel(block, cwd)}`
        : toolCallLabel(block, cwd),
    };
  if (block.role === "handoff")
    return { type: "notice", id: block.id, text: block.text || "Handed off" };
  if (block.role === "system" && block.text.trim())
    return {
      type: "notice",
      id: block.id,
      text: block.text,
      ...(isNoticeBlock(block) && block.notice === "error"
        ? { error: true }
        : {}),
    };
  return null;
}

export function phasesOf(
  blocks: Block[],
  cwd: string,
  live = false,
): MobilePhase[] {
  const phases = buildActivityPhases(blocks);
  let budget = MAX_STEPS;
  return phases.map((phase, index) => {
    const active = live && index === phases.length - 1;
    const steps = phase.steps.slice(-Math.max(0, budget));
    budget -= steps.length;
    const rows = steps.map((step) => ({
      id: step.id,
      label: isToolBlock(step)
        ? toolCallLabel(step, cwd)
        : proseSummary(step.text) || "Thinking",
      ...(isToolBlock(step) && toolCallState(step) === "rejected"
        ? { failed: true }
        : {}),
    }));
    // As ActivityPhaseGroup: a lone call the agent never introduced is not a
    // group, just its own row.
    if (!phase.headline && rows.length === 1)
      return {
        id: phase.id,
        kind: phase.kind,
        title: rows[0].label,
        steps: [],
      };
    return {
      id: phase.id,
      kind: phase.kind,
      title: activityPhaseTitle(phase, active),
      steps: rows,
    };
  });
}

/** As AgentTranscript: the turn's own prompt, past any app-written ones. */
export function turnUserBlock(blocks: Block[]): Block | undefined {
  return [...blocks]
    .reverse()
    .find((block) => block.role === "user" && !block.internal);
}

/** As AgentTranscript: the run's latest started prompt, hidden ones included. */
export function familiarTurnUserBlock(blocks: Block[]): Block | undefined {
  return (
    [...blocks]
      .reverse()
      .find((block) => block.role === "user" && block.startedAt != null) ??
    blocks.find((block) => block.role === "user")
  );
}

export function sumDurations(
  durations: (number | undefined)[],
): number | undefined {
  const known = durations.filter((value): value is number => value != null);
  return known.length
    ? known.reduce((sum, value) => sum + value, 0)
    : undefined;
}

/** An opened fold's entries: the agent's notes between its phases of work. */
export function foldEntries(
  items: TranscriptItem[],
  cwd: string,
): MobileFoldEntry[] {
  return items.flatMap((item): MobileFoldEntry[] => {
    if (item.type !== "block")
      return phasesOf(item.blocks, cwd).map((phase) => ({
        type: "phase",
        ...phase,
      }));
    return isProseBlock(item.block)
      ? [{ type: "prose", id: item.block.id, text: item.block.text }]
      : [];
  });
}

/** The blocks of a fold's activity items, for its one-line summary. */
export function activityBlocks(items: TranscriptItem[]): Block[] {
  return items.flatMap((item) => (item.type === "activity" ? item.blocks : []));
}

/** A Familiar's status line while it works: what it is doing, or what it waits on. */
export function familiarLiveLabel(
  turn: Block[],
  options: { pendingQuestion?: boolean; backgroundTasks?: string[] },
): string {
  const activity = turn.filter((block) => !block.internal && !block.draft);
  if (options.pendingQuestion && !activity.some(needsApproval))
    return "Waiting for answers…";
  const tasks = options.backgroundTasks?.length ?? 0;
  if (tasks === 1) return "Waiting for background task…";
  if (tasks > 1) return `Waiting for ${tasks} background tasks…`;
  return familiarWorkStatus(activity, true).label;
}
