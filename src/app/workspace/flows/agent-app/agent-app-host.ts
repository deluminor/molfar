import { invoke } from "@tauri-apps/api/core";
import type { AgentAppHost } from "@/features/agent-app/model/agent-app";
import { sessionConversationPage } from "@/features/agent-app/model/session-conversation";
import { getArtifact, saveArtifact } from "@/features/artifacts/artifacts";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { readFamiliarConversation } from "@/features/familiars/model/familiar-conversation";
import { loadFamiliarFiles, readAgentFile, writeAgentFile } from "@/features/familiars/model/familiar-files";
import { isHabitRun, loadHabits, updateHabits } from "@/features/familiars/model/familiar-habits";
import { createWorktree, listWorktrees } from "@/features/source-control/model/worktrees";
import { familiarOfSession, postAppArtifact, saveAppNote } from "./agent-app-content";
import type { AgentAppDeps } from "./agent-app-deps";
import { startAppSession } from "./agent-app-launch";
import { saveAppDraft, sendAppMessage } from "./agent-app-messages";
import { listAppSessions, readableAppSession, removeAppSession, stopAppSession } from "./agent-app-sessions";
import type { RequestSource } from "./agent-app-source";

/** The workspace as one CLI request sees it. */
export function agentAppHost(deps: AgentAppDeps, request: RequestSource): AgentAppHost {
  return {
    start: (launch, id, placement, notifyFamiliarId) =>
      startAppSession(deps, request, launch, id, placement, notifyFamiliarId),
    sessions: (cwd) => listAppSessions(deps, cwd),
    session: (id) => readableAppSession(deps, request, id),
    readConversation: async (target, options) =>
      isFamiliarSession(target.id)
        ? readFamiliarConversation(target, options)
        : sessionConversationPage(target, options),
    send: (id, prompt, requestId, notifyFamiliarId) =>
      sendAppMessage(deps, request, id, prompt, requestId, notifyFamiliarId),
    draft: (id, prompt, requestId) => saveAppDraft(deps, request, id, prompt, requestId),
    stop: (id) => stopAppSession(deps, request, id),
    remove: (id, mode) => removeAppSession(deps, request, id, mode),
    worktrees: (cwd) => listWorktrees(cwd),
    createWorktree: (cwd, branch, base, existing) => createWorktree(cwd, branch, base, existing),
    notes: () => invoke("notes_list"),
    note: (id) => invoke("notes_get", { id }),
    saveNote: saveAppNote,
    artifacts: () => invoke("artifacts_list"),
    artifact: getArtifact,
    saveArtifact,
    postArtifact: (sessionId, card) => postAppArtifact(deps, request, sessionId, card),
    board: deps.board(),
    isFamiliar: (id) => isFamiliarSession(id),
    isHabitRun: (id) => isHabitRun(id),
    familiarOf: familiarOfSession,
    habits: { load: loadHabits, update: updateHabits },
    agentFiles: (familiarId) => loadFamiliarFiles(familiarId),
    readAgentFile: (familiarId, path) => readAgentFile(familiarId, path),
    writeAgentFile: (familiarId, path, text, hash) => writeAgentFile(familiarId, path, text, hash),
  };
}
