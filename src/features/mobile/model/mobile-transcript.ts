import { familiarReactionBlocks } from "@/features/familiars/model/familiar-reaction";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { hasPendingApproval } from "@/domain/session/session-state";
import type { Session } from "@/domain/session/session";
import {
  firstFoldableIndex,
  foldableWork,
  isProseBlock,
  familiarTurnLatestStart,
  familiarTurnRuns,
  needsApproval,
  opensNewStretch,
  toolCallLabel,
  turnCopyText,
  workSummaryLine,
} from "@/features/sessions/model/transcript-activity";
import { TranscriptTurnCache } from "@/features/sessions/model/transcript-turn-cache";

import type { MobileTurn, MobileTurnItem } from "../types/transcript";
import {
  activityBlocks,
  blockItem,
  familiarLiveLabel,
  familiarTurnUserBlock,
  foldEntries,
  phasesOf,
  sumDurations,
  turnUserBlock,
} from "./mobile-transcript-blocks";

// The phone renders what AgentTranscript would, from turns the desktop has
// already grouped and folded, so both follow one set of rules.

const MAX_TURNS = 30;

type Options = {
  busy: boolean;
  familiar?: { name: string };
  pendingQuestion?: boolean;
  backgroundTasks?: string[];
  /**
   * Which turns to build, as [start, end) over every turn's ID; the latest
   * MAX_TURNS without one. Grouping covers the whole session, but building a
   * turn's items is the costly part, so only the ones sent are built.
   */
  range?: (turnIds: string[]) => [number, number];
};

export function mobileTranscript(
  session: Session,
  options: Options,
): MobileTurn[] {
  const inlineWork = !!options.familiar;
  const blocks = inlineWork
    ? familiarReactionBlocks(session.blocks)
    : session.blocks;
  const cache = new TranscriptTurnCache();
  const turns = cache.group(blocks, false, inlineWork);
  const activeTurnIndex = turns.reduce(
    (latest, turn, index) =>
      turn[0].familiarHabit || turn[0].role === "handoff" ? latest : index,
    -1,
  );
  const model = resolveModel(session.harness, session.model).name;
  const waiting = hasPendingApproval(blocks)
    ? "Waiting for approval"
    : options.pendingQuestion
      ? "Waiting for answers"
      : undefined;
  const [first, end] = options.range?.(turns.map((turn) => turn[0].id)) ?? [
    Math.max(0, turns.length - MAX_TURNS),
    turns.length,
  ];
  return turns.slice(first, end).map((turn, offset) => {
    const index = first + offset;
    const runs = inlineWork ? familiarTurnRuns(turn) : [turn];
    const userBlock = inlineWork
      ? familiarTurnUserBlock(runs[0])
      : turnUserBlock(turn);
    const lastRun =
      runs.length > 1
        ? familiarTurnUserBlock(runs[runs.length - 1])
        : userBlock;
    const habit = turn[0].familiarHabit;
    const agentName = options.familiar?.name;
    const standaloneReply =
      !userBlock && !!(agentName || habit) && turn.some(isProseBlock);
    const durationMs =
      runs.length > 1
        ? sumDurations(
            runs.map((run) => familiarTurnUserBlock(run)?.durationMs),
          )
        : userBlock?.durationMs;
    const settled = !(
      options.busy &&
      !standaloneReply &&
      index === activeTurnIndex
    );
    const items = cache.turnItems(turn, settled, { inlineWork });
    const startedAt = userBlock?.startedAt ?? habit?.at ?? turn[0].startedAt;
    const previous = turns[index - 1];
    const previousAt = !previous
      ? undefined
      : inlineWork
        ? familiarTurnLatestStart(previous)
        : (turnUserBlock(previous)?.startedAt ??
          previous[0].familiarHabit?.at ??
          previous[0].startedAt);
    const stampAt =
      inlineWork && startedAt != null && opensNewStretch(startedAt, previousAt)
        ? startedAt
        : undefined;
    const live = !settled;
    const reactedOnly =
      inlineWork &&
      !live &&
      items.every(
        (item) => item.type === "block" && item.block.role === "user",
      ) &&
      items.some(
        (item) => item.type === "block" && !!item.block.familiarReaction,
      );
    const fold = inlineWork ? undefined : foldableWork(items);
    const firstWork =
      habit || standaloneReply
        ? 0
        : inlineWork
          ? items.findIndex(
              (item) => item.type !== "block" || item.block.role !== "user",
            )
          : firstFoldableIndex(items);
    const showHeader =
      !reactedOnly &&
      (!!habit ||
        standaloneReply ||
        live ||
        durationMs != null ||
        (inlineWork ? firstWork >= 0 : !!fold));
    const headerAt = fold
      ? fold.start
      : firstWork >= 0
        ? firstWork
        : items.length;

    const header = (): MobileTurnItem => {
      const base = {
        type: "header" as const,
        id: `${turn[0].id}:header`,
        live,
        startedAt,
        durationMs,
        harness: userBlock?.turnModel?.harness ?? session.harness,
        model:
          agentName ?? userBlock?.turnModel?.name ?? (live ? model : undefined),
        entries: fold
          ? foldEntries(items.slice(fold.start, fold.end + 1), session.cwd)
          : [],
      };
      if (habit || standaloneReply)
        return { ...base, label: agentName ?? habit?.name };
      if (inlineWork) {
        if (!live) return { ...base, label: agentName };
        return { ...base, label: familiarLiveLabel(turn, options) };
      }
      if (live) return { ...base, waiting };
      if (durationMs != null) return base;
      return {
        ...base,
        label: workSummaryLine(
          fold ? activityBlocks(items.slice(fold.start, fold.end + 1)) : [],
        ),
      };
    };

    const out: MobileTurnItem[] = [];
    items.forEach((item, itemIndex) => {
      if (showHeader && itemIndex === headerAt) out.push(header());
      if (fold && itemIndex >= fold.start && itemIndex <= fold.end) return;
      if (item.type !== "block") {
        // A Familiar's process lives in its status line; only what needs you shows.
        if (inlineWork) {
          for (const block of item.blocks.filter(needsApproval))
            out.push({
              type: "notice",
              id: block.id,
              text: `Waiting for approval on desktop: ${toolCallLabel(block, session.cwd)}`,
            });
          return;
        }
        const active = live && itemIndex === items.length - 1;
        out.push({
          type: "work",
          id: item.blocks[0].id,
          live: active,
          phases: phasesOf(item.blocks, session.cwd, active),
        });
        return;
      }
      const converted = blockItem(item.block, session.cwd);
      if (converted) out.push(converted);
    });
    if (showHeader && headerAt >= items.length) out.push(header());
    // Messages stacked one after another share the last one's time.
    out.forEach((entry, at) => {
      if (entry.type === "user" && out[at + 1]?.type === "user")
        entry.compact = true;
    });

    const footer =
      settled &&
      !reactedOnly &&
      (durationMs != null || standaloneReply || (inlineWork && firstWork >= 0));
    const completedAt =
      habit?.at ??
      (runs.length > 1 && lastRun?.startedAt != null
        ? lastRun.startedAt + (lastRun.durationMs ?? 0)
        : startedAt != null
          ? startedAt + (durationMs ?? 0)
          : undefined);
    return {
      id: turn[0].id,
      ...(stampAt != null ? { stampAt } : {}),
      items: out,
      ...(footer
        ? {
            footer: true,
            completedAt,
            copyText: turnCopyText(
              inlineWork
                ? items.flatMap((item) =>
                    item.type === "block" ? [item.block] : [],
                  )
                : turn,
            ),
            ...(durationMs != null ? { durationMs } : {}),
            ...(!inlineWork && userBlock?.turnMetrics
              ? { metrics: userBlock.turnMetrics }
              : {}),
          }
        : {}),
    };
  });
}
