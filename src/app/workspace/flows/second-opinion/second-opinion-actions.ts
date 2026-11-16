import type { Block } from "@/domain/session/block";
import type { ModelTarget } from "@/domain/session/turn";
import type { Submit } from "../submission/submit-types";
import { type OpenBesideDeps, openSessionBeside } from "../tabs/open-session-beside";
import { handoffSession } from "../turn-control/handoff-session";
import { secondOpinionSession } from "./second-opinion-session";

/** Second opinion and handoff chats opened beside their source, created once for the workspace. */
export function createSecondOpinionActions(deps: { beside: OpenBesideDeps; submit: Submit }) {
  const { beside } = deps;
  const openSource = (sourceId: string) => {
    const source = beside.sessionsRef.current.find((session) => session.id === sourceId);
    return source && !source.worktreeRemoved ? source : undefined;
  };

  return {
    secondOpinion: (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = openSource(sourceId);
      if (!source) return;
      const { session, request } = secondOpinionSession(source, target, turn);
      openSessionBeside(beside, sourceId, session, source.cwd);
      deps.submit(session.id, request.prompt, [], request.options);
    },
    handoff: (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = openSource(sourceId);
      if (!source) return;
      openSessionBeside(beside, sourceId, handoffSession(source, target, turn), source.cwd, true);
    },
  };
}
