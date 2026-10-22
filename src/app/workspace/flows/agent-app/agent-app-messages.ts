import { flushSync } from "react-dom";
import type { Session } from "@/domain/session/session";
import { sessionDraftBlock } from "@/domain/session/session-state";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { submitWithSettlement } from "../../../model/managed-submission";
import type { AgentAppDeps } from "./agent-app-deps";
import type { RequestSource } from "./agent-app-source";

/** The open session a request may message or draft into, in a project it can reach. */
async function reachableSession(deps: AgentAppDeps, request: RequestSource, id: string): Promise<Session> {
  const target = await deps.ensureOpenSession(id);
  if (!target || target.orchestrationLeadId || !request.canAccessProject(target.cwd) || orchestrator.run(id))
    throw new Error("Session is unavailable in this project");
  return target;
}

function assertTakesMessage(target: Session): void {
  if (target.busy) throw new Error("Session is busy; try again when it finishes");
  if (sessionDraftBlock(target)) throw new Error("Session already has a draft; send or remove it first");
}

/** Sends a follow-up to a session, once per request id. */
export async function sendAppMessage(
  deps: AgentAppDeps,
  request: RequestSource,
  id: string,
  prompt: string,
  requestId: string,
  notifyFamiliarId?: string,
) {
  const target = await reachableSession(deps, request, id);
  const rememberFollowUp = () => {
    const current = deps.sessionsRef.current.find((session) => session.id === id) ?? target;
    request.rememberSession({
      sessionId: id,
      cwd: current.cwd,
      title: current.title,
      harness: current.harness,
      model: current.model,
    });
  };

  const previous = target.blocks.find((block) => block.appRequestId === requestId);
  if (previous) {
    if (previous.text !== prompt) throw new Error("Request ID was already used with another prompt");
    if (previous.draft) throw new Error("Request ID belongs to an unsent draft");
    rememberFollowUp();
    return { alreadySubmitted: true };
  }
  assertTakesMessage(target);

  const onSettled = notifyFamiliarId
    ? request.monitorCompletion(notifyFamiliarId, id, requestId, target.cwd, prompt)
    : undefined;
  const accepted = onSettled
    ? await submitWithSettlement({
        submit: (settle) => deps.submitSession(id, prompt, [], { appRequestId: requestId, onSettled: settle }),
        onSettled,
        rejectionMessage: "The monitored follow-up could not start.",
      })
    : await deps.submitSession(id, prompt, [], { appRequestId: requestId });
  if (!accepted) {
    onSettled?.discard();
    throw new Error("Session could not accept the follow-up");
  }
  rememberFollowUp();
  onSettled?.accept();
  return { alreadySubmitted: false };
}

/** Saves an unsent draft into a session, once per request id. */
export async function saveAppDraft(
  deps: AgentAppDeps,
  request: RequestSource,
  id: string,
  prompt: string,
  requestId: string,
) {
  const target = await reachableSession(deps, request, id);
  const previous = target.blocks.find((block) => block.appRequestId === requestId);
  if (previous) {
    if (previous.text !== prompt) throw new Error("Request ID was already used with another prompt");
    return { alreadySaved: true, draft: !!previous.draft };
  }
  assertTakesMessage(target);

  const saved = flushSync(() => deps.saveDraft(id, prompt, [], requestId));
  if (!saved) throw new Error("Session could not accept a draft");
  return { alreadySaved: false, draft: true };
}
