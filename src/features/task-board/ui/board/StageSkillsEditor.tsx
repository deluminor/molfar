import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listSkills, type DiscoveredSkill } from "../../../../platform/tauri/fs";
import { loadDisabledSkillPaths } from "../../../skills/model/skills";
import { STAGE_SKILLS } from "../../constants/skills";
import { resolveStageSkills, skillCandidates } from "../../model/resolve-stage-skills";
import type { AgentStage } from "../../types/stage";

type Props = {
  stage: AgentStage;
  /** Explicit list, or `undefined` for auto-detect. */
  value: readonly string[] | undefined;
  project: string | undefined;
  onChange: (skills: string[] | undefined) => void;
};

function catalogNames(skills: readonly DiscoveredSkill[]): Set<string> {
  return new Set(skills.map((skill) => skill.name));
}

/**
 * Curated defaults plus optional extras. First edit persists an explicit list;
 * Reset clears it back to auto-detect.
 */
export function StageSkillsEditor({ stage, value, project, onChange }: Props): ReactNode {
  const [catalog, setCatalog] = useState<DiscoveredSkill[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!project) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    void listSkills(project, loadDisabledSkillPaths())
      .then((skills) => {
        if (!cancelled) setCatalog(skills);
      })
      .catch((error: unknown) => {
        console.error("Task board: could not list skills for column editor", { project, error });
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const available = useMemo(() => catalogNames(catalog), [catalog]);
  const resolved = useMemo(() => resolveStageSkills(stage, value, available), [stage, value, available]);
  const defaults = STAGE_SKILLS[stage];
  const isCustom = value !== undefined;

  const extras = useMemo(() => {
    const curated = new Set<string>();
    for (const preferred of defaults) {
      for (const name of skillCandidates(preferred)) curated.add(name);
    }
    const source = value ?? resolved.skills;
    return source.filter((name) => !curated.has(name));
  }, [defaults, value, resolved.skills]);

  const persist = (next: string[]) => {
    onChange(next);
  };

  const ensureExplicit = (): string[] => {
    if (value !== undefined) return [...value];
    return [...resolved.skills];
  };

  const togglePreferred = (preferred: string, checked: boolean) => {
    const candidates = skillCandidates(preferred);
    const current = ensureExplicit();
    const without = current.filter((name) => !candidates.includes(name));
    if (!checked) {
      persist(without);
      return;
    }
    const pick = candidates.find((name) => available.has(name)) ?? preferred;
    if (without.includes(pick)) {
      persist(without);
      return;
    }
    persist([...without, pick]);
  };

  const preferredChecked = (preferred: string): boolean => {
    const candidates = skillCandidates(preferred);
    const source = value ?? resolved.skills;
    return candidates.some((name) => source.includes(name));
  };

  const preferredHint = (preferred: string): string | null => {
    if (isCustom) return null;
    const hit = skillCandidates(preferred).find((name) => available.has(name));
    if (!hit) return "Not installed — skipped";
    if (hit !== preferred) return `Using /${hit}`;
    return null;
  };

  const removeExtra = (name: string) => {
    persist(ensureExplicit().filter((entry) => entry !== name));
  };

  const addSkill = (name: string) => {
    const current = ensureExplicit();
    if (current.includes(name)) {
      setAdding(false);
      setQuery("");
      return;
    }
    persist([...current, name]);
    setAdding(false);
    setQuery("");
  };

  const addable = useMemo(() => {
    const selected = new Set(value ?? resolved.skills);
    const q = query.trim().toLowerCase();
    return catalog
      .filter((skill) => !selected.has(skill.name))
      .filter((skill) => !q || skill.name.includes(q) || skill.description.toLowerCase().includes(q))
      .slice(0, 12);
  }, [catalog, value, resolved.skills, query]);

  return (
    <div className="flex flex-col gap-2 border-t border-stroke pt-3" data-stage-skills>
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium text-content">Skills</span>
        <span className="text-[11px] text-content/45">
          {isCustom
            ? "Custom list for every card in this column."
            : "Auto-detected from installed skills until you change them."}
        </span>
      </div>

      {resolved.missing.length > 0 ? (
        <p role="status" className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-200/90">
          Missing and skipped: {resolved.missing.map((name) => `/${name}`).join(", ")}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {defaults.map((preferred) => {
          const hint = preferredHint(preferred);
          const checked = preferredChecked(preferred);
          return (
            <li key={preferred}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 hover:bg-content/[0.05]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => togglePreferred(preferred, event.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-content/85">/{preferred}</span>
                  {hint ? <span className="block text-[10.5px] text-content/40">{hint}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
        {extras.map((name) => (
          <li key={name}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 hover:bg-content/[0.05]">
              <input
                type="checkbox"
                checked
                onChange={() => removeExtra(name)}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-content/85">/{name}</span>
                {resolved.missing.includes(name) ? (
                  <span className="block text-[10.5px] text-amber-200/80">Not installed — skipped</span>
                ) : (
                  <span className="block text-[10.5px] text-content/40">Added</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-stroke bg-content/[0.03] p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills…"
            autoFocus
            className="h-7 rounded-md border border-stroke bg-transparent px-2 text-[12px] outline-none focus:border-accent/50"
          />
          <ul className="max-h-36 overflow-y-auto">
            {addable.length === 0 ? (
              <li className="px-1 py-1.5 text-[11px] text-content/40">
                {project ? "No matching skills" : "Pick a project to list skills"}
              </li>
            ) : (
              addable.map((skill) => (
                <li key={skill.path}>
                  <button
                    type="button"
                    onClick={() => addSkill(skill.name)}
                    className="flex w-full cursor-pointer flex-col rounded px-1.5 py-1 text-left hover:bg-content/[0.07]"
                  >
                    <span className="text-[12px] text-content/85">/{skill.name}</span>
                    <span className="line-clamp-2 text-[10.5px] text-content/40">{skill.description}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setQuery("");
            }}
            className="self-start cursor-pointer text-[11px] text-content/45 hover:text-content/70"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start cursor-pointer rounded-md px-1.5 py-1 text-[12px] text-content/50 hover:bg-content/[0.07] hover:text-content"
        >
          Add skill…
        </button>
      )}

      {isCustom ? (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="self-start cursor-pointer rounded-md px-1.5 py-1 text-[12px] text-content/50 hover:bg-content/[0.07] hover:text-content"
        >
          Reset skills to auto-detect
        </button>
      ) : null}
    </div>
  );
}
