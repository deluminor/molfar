import type { ReactNode } from "react";
import { Archive, LoaderCircle, Plus, SlidersHorizontal, CircleAlert } from "@/shared/ui/icons";
import { PRIMARY_BUTTON, QUIET_BUTTON } from "./button-styles";
import { ProjectFilterMenu } from "./ProjectFilterMenu";

type Props = {
  projects: readonly string[];
  project: string | null;
  archived: boolean;
  running: number;
  waiting: number;
  onProject: (project: string | null) => void;
  onArchived: (archived: boolean) => void;
  onSettings: () => void;
  onNew: () => void;
};

export function BoardToolbar({ projects, project, archived, running, waiting, onProject, onArchived, onSettings, onNew }: Props): ReactNode {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
      <ProjectFilterMenu projects={projects} project={project} onChange={onProject} />
      <button
        type="button"
        aria-pressed={archived}
        onClick={() => onArchived(!archived)}
        className={`${QUIET_BUTTON} ${archived ? "bg-content/[0.08] text-content" : ""}`}
      >
        <Archive className="size-3.5" strokeWidth={1.75} />
        Archived
      </button>

      <div className="ml-1 flex items-center gap-3 text-[12px] text-content/50" aria-live="polite">
        {running ? (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin text-accent motion-reduce:animate-none" strokeWidth={2} />
            {running} running
          </span>
        ) : null}
        {waiting ? (
          <span className="inline-flex items-center gap-1.5 text-amber-300/90">
            <CircleAlert className="size-3.5" strokeWidth={2} />
            {waiting} waiting on you
          </span>
        ) : null}
      </div>

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
