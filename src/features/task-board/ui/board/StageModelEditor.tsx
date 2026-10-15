import type { ReactNode } from "react";
import { defaultSessionChoice } from "../../../sessions/model/models";
import type { HarnessId } from "../../../sessions/model/session";
import { AccessPicker } from "../../../sessions/ui/AccessPicker";
import { ModelPicker } from "../../../sessions/ui/ModelPicker";
import { effortFromValues, effortValues } from "../../model/stage-model-values";
import type { StageModelConfig } from "../../types/stage";

type Props = {
  value: StageModelConfig | undefined;
  /** Project used for defaults and provider visibility; columns are global. */
  project?: string;
  onChange: (config: StageModelConfig) => void;
};

function seed(value: StageModelConfig | undefined, project: string | undefined): StageModelConfig {
  if (value) return value;
  const choice = defaultSessionChoice(project ?? "");
  return { harness: choice.harness, model: choice.model ?? "", runtimeMode: "auto" };
}

/** Provider, model, effort and permission mode for one stage. */
export function StageModelEditor({ value, project, onChange }: Props): ReactNode {
  const config = seed(value, project);

  return (
    <div className="flex flex-col gap-2">
      <ModelPicker
        harness={config.harness}
        model={config.model}
        values={effortValues(config.harness, config.model, config.effort)}
        project={project}
        side="bottom"
        variant="plain"
        onChange={(harness: HarnessId, model: string) =>
          onChange({ harness, model, runtimeMode: config.runtimeMode })
        }
        onSettingsChange={(settings) =>
          onChange({ ...config, effort: effortFromValues(config.harness, config.model, settings) })
        }
      />
      <AccessPicker
        value={config.runtimeMode}
        side="bottom"
        variant="plain"
        onChange={(runtimeMode) => onChange({ ...config, runtimeMode })}
      />
    </div>
  );
}
