import type { ReactNode } from "react";
import { projectName } from "../../../shared/lib/paths";
import { Archive, Plus, SlidersHorizontal } from "../../../shared/ui/icons";
import { PRIMARY_BUTTON, QUIET_BUTTON } from "./button-styles";

type Props = {
  projects: readonly string[];
  project: string | null;
  archived: boolean;
  onProject: (project: string | null) => void;
  onArchived: (archived: boolean) => void;
  onSettings: () => void;
  onNew: () => void;
};

export function BoardToolbar({ projects, project, archived, onProject, onArchived, onSettings, onNew }: Props): ReactNode {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5">
      <select
        aria-label="Filter by project"
        value={project ?? ""}
        onChange={(event) => onProject(event.target.value || null)}
        className="h-8 cursor-pointer rounded-md border border-stroke bg-content/[0.03] px-2 text-[12px] text-content/80 outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <option value="">All projects</option>
        {projects.map((path) => (
          <option key={path} value={path}>
            {projectName(path)}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-pressed={archived}
        onClick={() => onArchived(!archived)}
        className={`${QUIET_BUTTON} ${archived ? "bg-content/[0.08] text-content" : ""}`}
      >
        <Archive className="size-3.5" strokeWidth={1.75} />
        {archived ? "Showing archived" : "Show archived"}
      </button>

      <div className="flex-1" />

      <button type="button" onClick={onSettings} className={QUIET_BUTTON} aria-label="Board settings">
        <SlidersHorizontal className="size-3.5" strokeWidth={1.75} />
        Settings
      </button>
      <button type="button" onClick={onNew} disabled={projects.length === 0} className={PRIMARY_BUTTON}>
        <Plus className="size-3.5" strokeWidth={2} />
        New task
      </button>
    </div>
  );
}
