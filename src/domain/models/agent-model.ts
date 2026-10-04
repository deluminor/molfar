import type { HarnessId } from "../harness/harness";

export type ModelSettingChoice = {
  value: string;
  label: string;
};

export type ModelSetting = {
  id: string;
  label: string;
  kind: "select" | "toggle";
  value: string;
  options: ModelSettingChoice[];
  description?: string;
};

export type AgentModel = {
  id: string;
  harness: HarnessId;
  name: string;
  nativeId?: string;
  /** Upstream provider inside a multi-provider harness such as OpenCode. */
  provider?: {
    id: string;
    name: string;
  };
  settings?: ModelSetting[];
  /** Context window, when the harness catalog reports one. */
  contextWindow?: number;
};
