import type { Dispatch, RefObject, SetStateAction } from "react";
import { HARNESS_LABEL, type HarnessId } from "@/domain/harness/harness";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import {
  findFamiliar,
  isFamiliarSession,
  listFamiliars,
} from "@/features/familiars/model/familiar";
import { isHabitRun } from "@/features/familiars/model/familiar-habits";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import {
  hasMobileAttachments,
  mobileAttachments,
} from "@/features/mobile/model/mobile-attachments";
import { applyMobileChoice, mobileChoice, mobileWorkspaceChoice } from "@/features/mobile/model/mobile-models";
import { mobileNewSession, mobileProjectId } from "@/features/mobile/model/mobile-catalog";
import {
  loadPinnedProjects,
  loadRecents,
} from "@/features/projects/model/recents";
import {
  getSession,
  upsertSession,
} from "@/features/sessions/data/session-store";
import { newDefaultSession } from "@/features/sessions/model/session";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import { homeDir } from "@/platform/tauri/fs";
import { updateSessionState } from "../../../model/session-state";
import type { Submit } from "../submission/submit-types";

export type MobileCommandDeps = {
  sessionsRef: RefObject<Session[]>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  defaultRuntimeMode?: RuntimeMode;
  submit: Submit;
  ensureOpen: (sessionId: string) => Promise<Session | null | undefined>;
  rename: (sessionId: string, title: string) => Promise<unknown>;
  remove: (
    sessionId: string,
    mode: "archive" | "delete",
    skipConfirm: boolean,
    origin: "cli",
  ) => Promise<boolean>;
  stop: (sessionId: string) => unknown;
  changeModel: (sessionId: string, harness: HarnessId, model: string) => void;
  changeModelSettings: (
    sessionId: string,
    modelSettings: Record<string, string>,
  ) => void;
  changeRuntimeMode: (sessionId: string, runtimeMode: RuntimeMode) => void;
};

const MAX_TEXT = 100_000;

function addSession(deps: MobileCommandDeps, session: Session): void {
  updateSessionState(deps.sessionsRef, deps.setSessions, (current) => [
    ...current,
    session,
  ]);
}

const currentSession = (deps: MobileCommandDeps, session: Session): Session =>
  deps.sessionsRef.current.find((current) => current.id === session.id) ??
  session;

async function startSession(
  deps: MobileCommandDeps,
  params: Record<string, unknown>,
  text: string,
  commandId: string,
): Promise<{ sessionId: string }> {
  const paths = [
    ...loadRecents().map((project) => project.path),
    ...loadPinnedProjects(),
    ...listFamiliars().flatMap((familiar) => familiar.projects),
  ];
  const cwd = paths.find((path) => mobileProjectId(path) === params.projectId);
  if (!cwd) throw new Error("Project is no longer available");
  const id = String(params.sessionId ?? "");
  if (!id) throw new Error("Missing mobile session ID");

  const existing =
    deps.sessionsRef.current.find((current) => current.id === id) ??
    (await getSession(id));
  if (existing?.blocks.some((block) => block.appRequestId === commandId))
    return { sessionId: id };

  // Staged before the session exists, so a bad file leaves nothing behind.
  const attachments = await mobileAttachments(params.attachments);
  const session = existing ?? {
    ...applyMobileChoice(
      mobileNewSession(cwd, deps.defaultRuntimeMode),
      params,
    ),
    ...(await mobileWorkspaceChoice(cwd, params)),
  };
  // A placeholder title, so the first send seeds and generates one as the composer does.
  session.id = id;
  if (!existing) session.title = HARNESS_LABEL[session.harness];
  if (!deps.sessionsRef.current.some((current) => current.id === id))
    addSession(deps, session);

  if (
    !(await deps.submit(session.id, text, attachments, {
      appRequestId: commandId,
    }))
  )
    throw new Error("Desktop could not start this session");
  await upsertSession(currentSession(deps, session));
  return { sessionId: session.id };
}

function configureSession(
  deps: MobileCommandDeps,
  session: Session,
  params: Record<string, unknown>,
): void {
  // The phone's model sheet, through the same paths as the composer's
  // pickers, so a provider switch hands off on the next send as here.
  const choice = mobileChoice(params);
  const switched =
    choice.harness !== session.harness || choice.model !== session.model;
  if (choice.harness && choice.model && switched)
    deps.changeModel(session.id, choice.harness, choice.model);
  if (choice.modelSettings) {
    const resolved = resolveModel(
      choice.harness ?? session.harness,
      choice.model ?? session.model,
    );
    deps.changeModelSettings(
      session.id,
      mergeModelSettings(resolved, choice.modelSettings),
    );
  }
  if (choice.runtimeMode)
    deps.changeRuntimeMode(session.id, choice.runtimeMode);
}

/** Runs one command from a paired phone (`useMobileWorkspace`) against this window's workspace. */
export async function runMobileCommand(
  deps: MobileCommandDeps,
  method: string,
  params: Record<string, unknown>,
  commandId: string,
): Promise<{ sessionId: string }> {
  const text = typeof params.text === "string" ? params.text.trim() : "";
  const sends = method === "session.start" || method === "conversation.send";
  const empty = !text && !hasMobileAttachments(params.attachments);
  if (sends && (empty || text.length > MAX_TEXT))
    throw new Error("Enter a message under 100,000 characters");
  if (method === "session.start")
    return startSession(deps, params, text, commandId);

  const conversationId = String(params.conversationId ?? "");
  const familiarConversation = conversationId.startsWith("familiar:");
  const familiar = familiarConversation
    ? findFamiliar(conversationId.slice("familiar:".length))
    : undefined;
  if (familiarConversation && !familiar)
    throw new Error("Familiar is no longer available");

  if (method === "session.rename") {
    // As the sidebar's rename, which also renames a session that isn't open.
    const title = typeof params.title === "string" ? params.title.trim() : "";
    if (!title || title.length > 200)
      throw new Error("Enter a title under 200 characters");
    if (familiar) throw new Error("A Familiar's conversation can't be renamed");
    await deps.rename(conversationId, title);
    return { sessionId: conversationId };
  }

  if (method === "session.delete" || method === "session.archive") {
    // As the CLI's delete and archive: no desktop dialogs, and the worktree stays.
    const mode = method === "session.archive" ? "archive" : "delete";
    const verb = mode === "archive" ? "archived" : "deleted";
    const target = familiar ? undefined : await deps.ensureOpen(conversationId);
    const protectedTarget =
      !target ||
      target.orchestrationLeadId ||
      isFamiliarSession(target.id) ||
      isHabitRun(target.id);
    if (!target || protectedTarget)
      throw new Error(`This session can't be ${verb} from the phone`);
    if (!(await deps.remove(target.id, mode, true, "cli")))
      throw new Error(
        `Session could not be ${verb}; another session operation is in progress`,
      );
    return { sessionId: target.id };
  }

  const familiarSession = familiar
    ? await ensureFamiliarSession(familiar.id, {
        home: homeDir,
        load: deps.ensureOpen,
        create: (path) => newDefaultSession(path, deps.defaultRuntimeMode),
        add: (created) => addSession(deps, created),
      })
    : undefined;
  const session = familiarSession ?? (await deps.ensureOpen(conversationId));
  if (!session) throw new Error("Session is no longer available");

  if (method === "session.cancel") {
    await deps.stop(session.id);
    return { sessionId: session.id };
  }
  if (method === "session.configure") {
    configureSession(deps, session, params);
    return { sessionId: session.id };
  }
  if (method !== "conversation.send")
    throw new Error("Unsupported mobile command");

  const alreadySent =
    session.blocks.some((block) => block.appRequestId === commandId) ||
    session.queuedMessages?.some((message) => message.id === commandId);
  if (alreadySent) return { sessionId: session.id };

  const attachments = await mobileAttachments(params.attachments);
  // Mid-turn it steers or queues, as a message typed in the composer would.
  const sent = await deps.submit(session.id, text, attachments, {
    appRequestId: commandId,
    followsUp: true,
  });
  if (!sent)
    throw new Error(
      "Desktop could not accept the message. Wait for the current turn to finish and try again.",
    );
  await upsertSession(currentSession(deps, session));
  return { sessionId: session.id };
}
