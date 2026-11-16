import type { HarnessId } from "@/domain/harness/harness";
import type { Attachment } from "@/domain/session/attachment";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { ComposerDeps } from "./composer-deps";
import { changeModel, changeModelSettings, changeRuntimeMode } from "./composer-model";
import { removeDraft, saveDraft } from "./drafts";

/** The composer's model and draft flows bound to `deps`, created once for the workspace. */
export function createComposerActions(deps: ComposerDeps) {
  return {
    changeModel: (sessionId: string, harness: HarnessId, model: string) =>
      changeModel(deps, sessionId, harness, model),
    changeModelSettings: (sessionId: string, modelSettings: Record<string, string>) =>
      changeModelSettings(deps, sessionId, modelSettings),
    changeRuntimeMode: (sessionId: string, runtimeMode: RuntimeMode) =>
      changeRuntimeMode(deps, sessionId, runtimeMode),
    saveDraft: (sessionId: string, text: string, attachments: Attachment[] = [], appRequestId?: string) =>
      saveDraft(deps, sessionId, text, attachments, appRequestId),
    removeDraft: (sessionId: string, draftBlockId: string) => removeDraft(deps, sessionId, draftBlockId),
  };
}

export type ComposerActions = ReturnType<typeof createComposerActions>;
