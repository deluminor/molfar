import { useRef, useState, type ReactNode } from "react";
import { resolveModel } from "../../../sessions/model/models";
import { HARNESS_LABEL } from "../../../sessions/model/session";
import { HarnessIcon } from "../../../sessions/ui/HarnessIcon";
import { ChevronDown } from "../../../../shared/ui/icons";
import { Popover } from "../../../../shared/ui/Popover";
import type { StageModelConfig } from "../../types/stage";
import { StageModelEditor } from "./StageModelEditor";

type Props = {
  label: string;
  config: StageModelConfig | undefined;
  onChange: (config: StageModelConfig | undefined) => void;
};

function chipText(config: StageModelConfig | undefined): string {
  if (!config) return "Project default";
  const model = resolveModel(config.harness, config.model).name;
  return [HARNESS_LABEL[config.harness], model, config.effort].filter(Boolean).join(" · ");
}

/** The column's default model; cards may still override it per stage. */
export function ColumnModelChip({ label, config, onChange }: Props): ReactNode {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} model: ${chipText(config)}`}
        className="flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-content/50 outline-none transition-colors duration-150 hover:bg-content/[0.07] hover:text-content/80 focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none"
      >
        {config ? <HarnessIcon harness={config.harness} className="size-3 shrink-0" /> : null}
        <span className="min-w-0 truncate">{chipText(config)}</span>
        <ChevronDown className="size-3 shrink-0" strokeWidth={2} />
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          align="start"
          width={300}
          role="dialog"
          aria-label={`${label} model`}
          onDismiss={() => setOpen(false)}
          className="flex flex-col gap-3 p-3"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-content/40">{label} runs with</div>
          <StageModelEditor value={config} onChange={onChange} />
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
