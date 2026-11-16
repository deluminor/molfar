import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { HARNESS_LABEL, type HarnessId } from "@/domain/harness/harness";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { listSkills } from "@/platform/tauri/fs";
import { defaultSessionChoice } from "@/features/sessions/model/models";
import { HarnessIcon } from "@/features/sessions/ui/HarnessIcon";
import { loadDisabledSkillPaths } from "@/features/skills/model/skills";
import { ChevronsUpDown } from "@/shared/ui/icons";
import { Popover } from "@/shared/ui/Popover";
import { resolveStageSkills } from "../../model/resolve-stage-skills";
import type { AgentStage, StageModelConfig } from "../../types/stage";
import { StageModelEditor } from "./StageModelEditor";
import { StageSkillsEditor } from "./StageSkillsEditor";

type Props = {
  label: string;
  stage: AgentStage;
  config: StageModelConfig | undefined;
  skills: readonly string[] | undefined;
  /** Project whose default applies when the column has none (the filter, or the first rail project). */
  project: string | undefined;
  onChange: (config: StageModelConfig | undefined) => void;
  onSkillsChange: (skills: string[] | undefined) => void;
};

/** Menus the embedded pickers portal out; a click in them is not outside this popover. */
const NESTED_PICKERS =
  "[data-model-picker], [data-model-control], [data-model-settings], [data-access-picker], [data-stage-skills]";

type Shown = { harness: HarnessId; model: string; effort?: string; isDefault: boolean };

function shown(config: StageModelConfig | undefined, project: string | undefined): Shown {
  if (config) return { ...config, isDefault: false };
  const choice = defaultSessionChoice(project ?? "");
  return { harness: choice.harness, model: resolveModel(choice.harness, choice.model).id, isDefault: true };
}

/** The model a column runs, always spelled out; a project default is tagged as such. */
export function ColumnModelChip({
  label,
  stage,
  config,
  skills,
  project,
  onChange,
  onSkillsChange,
}: Props): ReactNode {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [missingSkills, setMissingSkills] = useState(0);
  const current = shown(config, project);
  const modelName = resolveModel(current.harness, current.model).name;
  const summary = [HARNESS_LABEL[current.harness], modelName, current.effort].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!project || skills === undefined) {
      setMissingSkills(0);
      return;
    }
    let cancelled = false;
    void listSkills(project, loadDisabledSkillPaths())
      .then((catalog) => {
        if (cancelled) return;
        const available = new Set(catalog.map((skill) => skill.name));
        setMissingSkills(resolveStageSkills(stage, skills, available).missing.length);
      })
      .catch(() => {
        if (!cancelled) setMissingSkills(0);
      });
    return () => {
      cancelled = true;
    };
  }, [project, stage, skills]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} model: ${summary}${current.isDefault ? " (project default)" : ""}${
          missingSkills ? `; ${missingSkills} skill${missingSkills === 1 ? "" : "s"} missing` : ""
        }`}
        className={`group/chip flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-left text-[11.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none ${
          open ? "border-accent/40 bg-accent/[0.06]" : "border-stroke bg-content/[0.03] hover:border-content/15 hover:bg-content/[0.06]"
        }`}
      >
        <HarnessIcon harness={current.harness} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-content/80">
          {modelName}
          {current.effort ? <span className="text-content/40"> · {current.effort}</span> : null}
        </span>
        {missingSkills > 0 ? (
          <span className="shrink-0 rounded px-1 text-[10px] font-medium uppercase tracking-wide text-amber-200/90">
            Skills
          </span>
        ) : null}
        {current.isDefault ? (
          <span className="shrink-0 rounded px-1 text-[10px] font-medium uppercase tracking-wide text-content/35">Default</span>
        ) : null}
        <ChevronsUpDown className="size-3 shrink-0 text-content/35 group-hover/chip:text-content/60" strokeWidth={2} />
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          align="start"
          width={320}
          role="dialog"
          aria-label={`${label} model and skills`}
          onDismiss={() => setOpen(false)}
          ignore={NESTED_PICKERS}
          className="flex max-h-[min(70vh,520px)] flex-col gap-3 overflow-y-auto p-3"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-content">{label} runs with</span>
            <span className="text-[11px] text-content/45">
              {current.isDefault
                ? "Each project's default model until you pick one."
                : "Every card in this column, unless a card overrides it."}
            </span>
          </div>
          <StageModelEditor value={config} project={project} onChange={onChange} />
          {config ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="self-start cursor-pointer rounded-md px-1.5 py-1 text-[12px] text-content/50 hover:bg-content/[0.07] hover:text-content"
            >
              Use each project's default
            </button>
          ) : null}
          <StageSkillsEditor stage={stage} value={skills} project={project} onChange={onSkillsChange} />
        </Popover>
      ) : null}
    </>
  );
}
