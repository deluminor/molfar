import {
  familiarLook,
  familiarState,
  type Familiar,
} from "../../familiars/model/familiar";
import { projectMascot } from "../../projects/model/projectMascots";
import { sameProjectPath } from "../../projects/model/recents";
import type { Block, Session } from "../../sessions/model/session";
import { projectName } from "../../../shared/lib/paths";
import type {
  CompanionBlock,
  CompanionFamiliar,
  CompanionProject,
  CompanionProjectRef,
  CompanionSession,
  CompanionTranscript,
} from "./protocol";

export const TRANSCRIPT_LIMIT_DEFAULT = 80;
export const TRANSCRIPT_LIMIT_MAX = 200;
const PREVIEW_CHARS = 160;
/** A phone never needs a whole tool dump or a book-length reply in one poll. */
const BLOCK_TEXT_MAX = 24_000;

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Blocks the desktop transcript shows the user; app plumbing stays home. */
function visible(block: Block): boolean {
  if (block.internal && !block.familiarSessionCompletion) return false;
  if (block.draft) return false;
  return true;
}

export function companionBlock(block: Block): CompanionBlock {
  const text =
    block.text.length > BLOCK_TEXT_MAX
      ? `${block.text.slice(0, BLOCK_TEXT_MAX)}\n…`
      : block.text;
  return {
    id: block.id,
    role: block.role,
    text,
    ...(block.startedAt || block.sentAt
      ? { at: block.startedAt ?? block.sentAt }
      : block.familiarHabit
        ? { at: block.familiarHabit.at }
        : {}),
    ...(block.streaming ? { streaming: true } : {}),
    ...(block.tool
      ? {
          tool: {
            ...(block.tool.title ? { title: oneLine(block.tool.title, 200) } : {}),
            ...(block.tool.kind ? { kind: block.tool.kind } : {}),
            ...(block.tool.status ? { status: block.tool.status } : {}),
          },
        }
      : {}),
    ...(block.approval
      ? {
          approval: {
            requestId: block.approval.requestId,
            ...(block.approval.decided ? { decided: block.approval.decided } : {}),
          },
        }
      : {}),
    ...(block.attachments?.length
      ? {
          attachments: block.attachments.map((attachment) => ({
            name: attachment.name,
            kind: attachment.kind,
            mimeType: attachment.mimeType,
          })),
        }
      : {}),
    ...(block.familiarCard ? { card: block.familiarCard } : {}),
    ...(block.familiarHabit ? { habit: { name: block.familiarHabit.name } } : {}),
    ...(block.notice ? { notice: block.notice } : {}),
  };
}

/** FNV-1a over what the client renders; cheap enough for every poll. */
export function revisionOf(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + text.length.toString(36);
}

export function companionTranscript(
  session: Session,
  limit = TRANSCRIPT_LIMIT_DEFAULT,
): CompanionTranscript {
  const shown = session.blocks.filter(visible);
  const kept = shown.slice(-limit);
  const state = familiarState(session);
  const body = {
    sessionId: session.id,
    title: session.title,
    busy: !!session.busy,
    status: state.status,
    ...(state.activity ? { activity: state.activity } : {}),
    harness: session.harness,
    model: session.model,
    runtimeMode: session.runtimeMode,
    ...(session.pendingQuestion && !session.worktreeRemoved
      ? {
          question: {
            requestId: session.pendingQuestion.requestId,
            ...(session.pendingQuestion.title
              ? { title: session.pendingQuestion.title }
              : {}),
            questions: session.pendingQuestion.questions,
          },
        }
      : {}),
    blocks: kept.map(companionBlock),
    truncated: shown.length > kept.length,
  };
  return { ...body, revision: revisionOf(body) };
}

function preview(session: Session | undefined): CompanionFamiliar["preview"] {
  if (!session) return undefined;
  for (let i = session.blocks.length - 1; i >= 0; i--) {
    const block = session.blocks[i];
    if (!visible(block) || !block.text.trim()) continue;
    if (block.role === "assistant" || block.role === "user")
      return { role: block.role, text: oneLine(block.text, PREVIEW_CHARS) };
  }
  return undefined;
}

export function companionFamiliar(
  familiar: Familiar,
  session: Session | undefined,
  unread: boolean,
): CompanionFamiliar {
  const look = familiarLook(familiar);
  const mascot = projectMascot(familiar.id, familiar.mascot);
  const state = session ? familiarState(session) : { status: "idle" as const };
  const last = preview(session);
  return {
    id: familiar.id,
    name: look.name,
    color: look.color,
    mascot: { name: mascot.name, rest: mascot.restPath, talk: mascot.talkPath },
    projects: look.projects,
    status: state.status,
    ...(state.activity ? { activity: state.activity } : {}),
    ...(last ? { preview: last } : {}),
    unread,
  };
}

export function projectRef(
  path: string,
  label?: (path: string) => string,
): CompanionProjectRef {
  return { path, name: label?.(path) ?? projectName(path) };
}

export function companionSession(
  session: Session,
  label?: (path: string) => string,
): CompanionSession {
  const state = familiarState(session);
  return {
    id: session.id,
    title: session.title,
    project: projectRef(session.cwd, label),
    harness: session.harness,
    model: session.model,
    runtimeMode: session.runtimeMode,
    status: state.status,
    ...(state.activity ? { activity: state.activity } : {}),
    ...(session.branch ? { branch: session.branch } : {}),
  };
}

const STATUS_RANK = { "needs-you": 0, working: 1, idle: 2 } as const;

export function sortSessions(sessions: CompanionSession[]): CompanionSession[] {
  return [...sessions].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
}

export function companionProjects(
  paths: readonly string[],
  sessions: readonly CompanionSession[],
  label?: (path: string) => string,
): CompanionProject[] {
  return paths.map((path) => {
    const mine = sessions.filter((session) =>
      sameProjectPath(session.project.path, path),
    );
    return {
      ...projectRef(path, label),
      working: mine.filter((session) => session.status === "working").length,
      needsYou: mine.filter((session) => session.status === "needs-you").length,
    };
  });
}
