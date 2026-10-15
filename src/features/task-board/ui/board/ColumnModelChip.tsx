import { useRef, useState, type ReactNode } from "react";
import { defaultSessionChoice, resolveModel } from "../../../sessions/model/models";
import { HARNESS_LABEL, type HarnessId } from "../../../sessions/model/session";
import { HarnessIcon } from "../../../sessions/ui/HarnessIcon";
import { ChevronsUpDown } from "../../../../shared/ui/icons";
import { Popover } from "../../../../shared/ui/Popover";
import type { StageModelConfig } from "../../types/stage";
import { StageModelEditor } from "./StageModelEditor";

type Props = {
  label: string;
  config: StageModelConfig | undefined;
  /** Project whose default applies when the column has none (the filter, or the first rail project). */
  project: string | undefined;
  onChange: (config: StageModelConfig | undefined) => void;
};

/** Menus the embedded pickers portal out; a click in them is not outside this popover. */
const NESTED_PICKERS = "[data-model-picker], [data-model-control], [data-model-settings], [data-access-picker]";

type Shown = { harness: HarnessId; model: string; effort?: string; isDefault: boolean };

function shown(config: StageModelConfig | undefined, project: string | undefined): Shown {
  if (config) return { ...config, isDefault: false };
  const choice = defaultSessionChoice(project ?? "");
  return { harness: choice.harness, model: resolveModel(choice.harness, choice.model).id, isDefault: true };
}

/** The model a column runs, always spelled out; a project default is tagged as such. */
export function ColumnModelChip({ label, config, project, onChange }: Props): ReactNode {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = shown(config, project);
  const modelName = resolveModel(current.harness, current.model).name;
  const summary = [HARNESS_LABEL[current.harness], modelName, current.effort].filter(Boolean).join(" · ");

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} model: ${summary}${current.isDefault ? " (project default)" : ""}`}
        className={`group/chip flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-left text-[11.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none ${
          open ? "border-accent/40 bg-accent/[0.06]" : "border-stroke bg-content/[0.03] hover:border-content/15 hover:bg-content/[0.06]"
        }`}
      >
        <HarnessIcon harness={current.harness} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-content/80">
          {modelName}
          {current.effort ? <span className="text-content/40"> · {current.effort}</span> : null}
        </span>
        {current.isDefault ? (
          <span className="shrink-0 rounded px-1 text-[10px] font-medium uppercase tracking-wide text-content/35">Default</span>
        ) : null}
        <ChevronsUpDown className="size-3 shrink-0 text-content/35 group-hover/chip:text-content/60" strokeWidth={2} />
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          align="start"
          width={300}
          role="dialog"
          aria-label={`${label} model`}
          onDismiss={() => setOpen(false)}
          ignore={NESTED_PICKERS}
          className="flex flex-col gap-3 p-3"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-content">{label} runs with</span>
            <span className="text-[11px] text-content/45">
              {current.isDefault ? "Each project's default model until you pick one." : "Every card in this column, unless a card overrides it."}
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
        </Popover>
      ) : null}
    </>
  );
}
