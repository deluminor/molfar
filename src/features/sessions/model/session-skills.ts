import { sessionWorkCwd } from "@/domain/session/session-state";
import type { HarnessId } from "@/domain/harness/harness";
import { hasNativeCommands, type SkillCatalogContext } from "@/features/skills/model/skills";

type SkillWarmupSession = {
  id?: string;
  harness: HarnessId;
  cwd: string;
  worktreeCwd?: string;
};

export function nativeSkillContextForSession(
  session: SkillWarmupSession,
): SkillCatalogContext | null {
  if (!hasNativeCommands(session.harness)) return null;
  return {
    harness: session.harness,
    cwd: sessionWorkCwd(session),
    ...(session.id ? { sessionId: session.id } : {}),
  };
}
