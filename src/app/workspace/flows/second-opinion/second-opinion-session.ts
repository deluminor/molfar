import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { formatSessionTitle } from "@/domain/session/title";
import type { ModelTarget } from "@/domain/session/turn";
import {
  buildSecondOpinionRequest,
  harnessForTurn,
  SECOND_OPINION_TITLE,
} from "@/features/sessions/model/second-opinion";
import { newSession } from "@/features/sessions/model/session";
import { mergeModelSettings, resolveModel } from "@/integrations/harness/core/models/resolve-model";

/** A fresh chat on `target` in the source's working copy, and the review request it starts with. */
export function secondOpinionSession(source: Session, target: ModelTarget, turn: Block[]) {
  const { harness, model, modelSettings } = target;
  const request = buildSecondOpinionRequest({
    from: harnessForTurn(source.blocks, turn, source.harness),
    to: harness,
    turn,
    cwd: sessionWorkCwd(source),
  });
  const session: Session = {
    ...newSession(harness, source.cwd, model, source.runtimeMode),
    worktreeCwd: source.worktreeCwd,
    branch: source.branch,
    modelSettings: mergeModelSettings(resolveModel(harness, model), modelSettings),
    title: formatSessionTitle(harness, SECOND_OPINION_TITLE),
  };
  return { session, request };
}
