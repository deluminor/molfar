import { STAGE_SKILLS } from "../constants/skills";
import type { AgentStage } from "../types/stage";

export type ResolvedStageSkills = {
  /** Names to put in the stage prompt (present in the catalog). */
  skills: string[];
  /** Configured names that were not in the catalog (explicit lists only). */
  missing: string[];
};

/**
 * Candidate names for one default slot: prefer the hub skill, then the same
 * name without the `d-` prefix when the hub copy is absent.
 */
export function skillCandidates(preferred: string): readonly string[] {
  if (preferred.startsWith("d-") && preferred.length > 2) {
    return [preferred, preferred.slice(2)];
  }
  return [preferred];
}

/**
 * Resolves which skill tokens a stage prompt should carry.
 *
 * - `configured === undefined` — auto-detect: for each `STAGE_SKILLS` slot, take
 *   the first candidate present in `available`; skip the slot if none exist.
 * - `configured` set (even `[]`) — use that list; drop unknown names into `missing`.
 */
export function resolveStageSkills(
  stage: AgentStage,
  configured: readonly string[] | undefined,
  available: ReadonlySet<string>,
): ResolvedStageSkills {
  if (configured !== undefined) {
    const skills: string[] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const name of configured) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (available.has(name)) skills.push(name);
      else missing.push(name);
    }
    return { skills, missing };
  }

  const skills: string[] = [];
  for (const preferred of STAGE_SKILLS[stage]) {
    const hit = skillCandidates(preferred).find((name) => available.has(name));
    if (hit) skills.push(hit);
  }
  return { skills, missing: [] };
}
