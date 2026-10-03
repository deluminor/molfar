export type ToolPreviewKind = "read" | "write" | "shell" | "search";

export type ToolPreviewLineKind = "add" | "del" | "context";

export type ToolPreviewLine = {
  number?: number;
  kind: ToolPreviewLineKind;
  text: string;
};

export type ToolPreview = {
  kind: ToolPreviewKind;
  title?: string;
  path?: string;
  fileName?: string;
  startLine?: number;
  additions?: number;
  deletions?: number;
  /** Write supplied new contents without the previous file to compare. */
  contentOnly?: boolean;
  query?: string;
  lines?: ToolPreviewLine[];
  output?: string;
};
/** One thing a subagent did, mirrored into the parent transcript. */
export type AgentStepKind = "tool" | "message" | "reasoning";

export type AgentStep = {
  /** Provider step identity, so repeats merge instead of stacking up. */
  id: string;
  kind: AgentStepKind;
  /** Tool label, or the prose the subagent wrote. */
  text: string;
  toolKind?: string;
  status?: string;
  detail?: string;
  preview?: ToolPreview;
};
/**
 * The inside of a delegated run: what the subagent is called, and the trail it
 * left. Held on the parent Agent tool block so the transcript can open it
 * without a second session.
 */
export type AgentRunMeta = {
  /** What the subagent is called, e.g. "Correctness review". */
  name: string;
  /** Provider agent type, e.g. "code-reviewer". */
  agentType?: string;
  /** Model reported for the child, which may differ from its parent. */
  model?: string;
  steps: AgentStep[];
};
