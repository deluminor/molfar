import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import { DEFAULT_TAIL, MAX_PAGE } from "../constants";
import { mobileAccountUsage } from "./mobile-account-usage";
import { mobileConversation } from "./mobile-conversation";
import {
  mobileFileHighlight,
  mobileProjectFile,
  mobileProjectFiles,
  mobileProjectSearch,
} from "./mobile-files";
import { mobileProjectChanges, mobileProjectGit } from "./mobile-git";
import { mobileModels, mobileProjectWorktrees } from "./mobile-models";
import { turnsBefore } from "./mobile-watch";

export type MobileReadContext = {
  sessions: readonly Session[];
  defaultRuntimeMode?: RuntimeMode;
  /** The sessions a watch on a conversation has read from disk, if one is open. */
  savedFor: (conversationId: string) => Map<string, Session> | undefined;
};

type Params = Record<string, unknown>;
type Read = (params: Params, context: MobileReadContext) => unknown;

const text = (value: unknown) => String(value ?? "");
const worktree = (params: Params) =>
  typeof params.worktreePath === "string" ? params.worktreePath : undefined;

async function olderTurns(params: Params, context: MobileReadContext) {
  const conversationId = text(params.conversationId);
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, Number(params.limit) || DEFAULT_TAIL),
  );
  let older = false;
  // A watch on it has the session at hand already.
  const conversation = await mobileConversation(
    conversationId,
    context.sessions,
    context.savedFor(conversationId),
    (turnIds) => {
      const page = turnsBefore(turnIds, text(params.before), limit);
      older = page.older;
      return [page.start, page.end];
    },
  );
  return { turns: conversation.turns, older };
}

function models(params: Params, context: MobileReadContext) {
  const conversationId =
    typeof params.conversationId === "string"
      ? params.conversationId
      : undefined;
  return mobileModels(
    { projectId: text(params.projectId), conversationId },
    context.sessions,
    conversationId ? context.savedFor(conversationId) : undefined,
    context.defaultRuntimeMode,
  );
}

/** Requests that only read the workspace, so a retry needs no receipt. */
const READS = new Map<string, Read>(
  Object.entries({
    "conversation.read": (params, context) =>
      mobileConversation(text(params.conversationId), context.sessions),
    "conversation.older": olderTurns,
    "models.list": models,
    "accounts.usage": (params) =>
      mobileAccountUsage(params.provider, params.refresh === true),
    "project.changes": (params) =>
      mobileProjectChanges(text(params.projectId), worktree(params)),
    "project.files": (params) =>
      mobileProjectFiles(
        text(params.projectId),
        text(params.path),
        worktree(params),
      ),
    "project.file": (params) =>
      mobileProjectFile(
        text(params.projectId),
        text(params.path),
        worktree(params),
      ),
    "project.fileHighlight": (params) =>
      mobileFileHighlight(text(params.job), Number(params.from) || 0),
    "project.search": (params) =>
      mobileProjectSearch(
        text(params.projectId),
        text(params.query),
        worktree(params),
      ),
    "project.git": (params) =>
      mobileProjectGit(text(params.projectId), worktree(params)),
    "project.worktrees": (params) =>
      mobileProjectWorktrees(text(params.projectId)),
  } satisfies Record<string, Read>),
);

/** The read for `method`, or undefined when the request changes something. */
export function mobileRead(method: string): Read | undefined {
  return READS.get(method);
}
