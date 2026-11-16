import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { formatSessionTitle, sessionDisplayTitle } from "@/domain/session/title";
import type { ModelTarget } from "@/domain/session/turn";
import {
  buildDeterministicHandoff,
  buildHandoffComposerCard,
  HANDOFF_TITLE,
  sessionThroughTurn,
} from "@/features/sessions/model/handoff";
import {
  harnessForTurn,
  turnEditedFiles,
  turnUserRequest,
} from "@/features/sessions/model/second-opinion";
import { newSession } from "@/features/sessions/model/session";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";

/** A new session on `target` that picks up `source` through `turn`. */
export function handoffSession(
  source: Session,
  target: ModelTarget,
  turn: Block[],
): Session {
  const { harness, model, modelSettings } = target;
  const cwd = sessionWorkCwd(source);
  const from = harnessForTurn(source.blocks, turn, source.harness);
  const sliced = sessionThroughTurn(source, turn);
  const display = sessionDisplayTitle(source.title, source.harness);

  return {
    ...newSession(harness, source.cwd, model, source.runtimeMode),
    worktreeCwd: source.worktreeCwd,
    branch: source.branch,
    modelSettings: mergeModelSettings(resolveModel(harness, model), modelSettings),
    title: formatSessionTitle(
      harness,
      display === "New session" ? HANDOFF_TITLE : display,
    ),
    handoffCard: buildHandoffComposerCard({
      from,
      to: harness,
      brief: buildDeterministicHandoff(sliced),
      userRequest: turnUserRequest(turn),
      files: turnEditedFiles(sliced.blocks, cwd),
    }),
  };
}
