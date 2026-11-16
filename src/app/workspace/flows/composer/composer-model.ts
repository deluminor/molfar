import type { HarnessId } from "@/domain/harness/harness";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { resumeFamiliarUsageLimit } from "@/features/familiars/model/familiar-usage-limit";
import { isPreparingHandoff, planComposerSwitch } from "@/features/sessions/model/handoff";
import {
  preferredModelSettings,
  saveLastModelSettings,
  saveRecentModelChoice,
} from "@/features/sessions/model/models";
import { resumeUsageLimitedSession } from "@/features/sessions/model/usage-limit";
import { forgetHarnessSession } from "@/integrations/harness";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { withComposerSwitch, withHarnessChoice } from "../../../model/harness-choice";
import type { ComposerDeps } from "./composer-deps";

/**
 * Picks another model for the session. Changing harness mid-conversation arms
 * a handoff; a usage-limited session resumes on the new choice.
 */
export function changeModel(deps: ComposerDeps, sessionId: string, harness: HarnessId, model: string): void {
  const current = deps.sessionsRef.current.find((s) => s.id === sessionId);
  if (!current || isPreparingHandoff(current)) return;

  const resolved = resolveModel(harness, model);
  saveRecentModelChoice(resolved.harness, resolved.id);
  if (current.modelSettings) saveLastModelSettings(current.modelSettings, "fill");
  const modelSettings = preferredModelSettings(resolved, current.modelSettings);
  const plan = planComposerSwitch(current, harness);
  const recoverLimit =
    !current.busy && !!current.usageLimit && (current.harness !== harness || current.model !== resolved.id);
  if (plan.kind === "empty") void forgetHarnessSession(plan.forget, sessionId);

  const recover = isFamiliarSession(sessionId) ? resumeFamiliarUsageLimit : resumeUsageLimitedSession;
  deps.setSessions((prev) =>
    prev.map((s) => {
      if (s.id !== sessionId) return s;
      const next = withComposerSwitch(withHarnessChoice(s, harness, resolved.id, modelSettings), plan);
      return recoverLimit ? recover(next) : next;
    }),
  );
}

export function changeModelSettings(
  deps: ComposerDeps,
  sessionId: string,
  modelSettings: Record<string, string>,
): void {
  saveLastModelSettings(modelSettings);
  deps.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, modelSettings } : s)));
}

export function changeRuntimeMode(deps: ComposerDeps, sessionId: string, runtimeMode: RuntimeMode): void {
  deps.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, runtimeMode } : s)));
}
