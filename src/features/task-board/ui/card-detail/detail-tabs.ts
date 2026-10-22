import {
  CircleHelp,
  DashboardSquare,
  File,
  FileDiff,
  FileScript,
  GitCompare,
  ListBullet,
  StickyNote,
  type IconComponent,
} from "@/shared/ui/icons";
import type { ArtifactKind, ArtifactMeta } from "../../types/artifact";
import type { DetailIntent } from "./detail-intent";

export type DetailTab = "overview" | "task" | "spec" | "plan" | "questions" | "impl_report" | "review" | "diff";

export const DETAIL_TABS: readonly { id: DetailTab; label: string; icon: IconComponent; kind?: ArtifactKind }[] = [
  { id: "overview", label: "Overview", icon: DashboardSquare },
  { id: "task", label: "Task", icon: StickyNote, kind: "task" },
  { id: "spec", label: "Spec", icon: FileScript, kind: "spec" },
  { id: "plan", label: "Plan", icon: ListBullet, kind: "plan" },
  { id: "questions", label: "Questions", icon: CircleHelp, kind: "questions" },
  { id: "impl_report", label: "Report", icon: File, kind: "impl_report" },
  { id: "review", label: "Review", icon: GitCompare, kind: "review" },
  { id: "diff", label: "Diff", icon: FileDiff },
];

export function initialTab(intent: DetailIntent): DetailTab {
  if (intent === "rework") return "review";
  if (intent === "requestChanges") return "questions";
  return "overview";
}

/**
 * Artifact tabs appear once their artifact exists; Overview, Task and Diff always show.
 * At the plan gate Questions always shows, so changes can be requested with a note alone.
 */
export function visibleTabs(artifacts: readonly ArtifactMeta[], atPlanGate: boolean) {
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  return DETAIL_TABS.filter(
    (tab) => !tab.kind || tab.kind === "task" || kinds.has(tab.kind) || (tab.kind === "questions" && atPlanGate),
  );
}
