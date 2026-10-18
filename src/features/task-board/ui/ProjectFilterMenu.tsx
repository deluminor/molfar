import { useRef, useState, type ReactNode } from "react";
import { projectName } from "@/shared/lib/paths";
import { Check, ChevronsUpDown, Kanban } from "@/shared/ui/icons";
import { Popover } from "@/shared/ui/Popover";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";

type Props = {
  projects: readonly string[];
  project: string | null;
  onChange: (project: string | null) => void;
  /** Offer "All projects"; off when a single project must be chosen. */
  allowAll?: boolean;
  /** Stretch to the field width, e.g. inside a form. */
  block?: boolean;
};

function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[12.5px] outline-none transition-colors duration-150 focus-visible:bg-content/[0.08] ${selected ? "bg-content/[0.07] text-content" : "text-content/75 hover:bg-content/[0.06] hover:text-content"}`}
    >
      {children}
      <span className="flex-1" />
      {selected ? <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2} /> : null}
    </button>
  );
}

/** Which project the board shows; the current choice is always visible on the button. */
export function ProjectFilterMenu({ projects, project, onChange, allowAll = true, block = false }: Props): ReactNode {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project filter: ${project ? projectName(project) : "All projects"}`}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 min-w-0 ${block ? "w-full" : "max-w-[260px]"} cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[12.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 ${open ? "border-accent/40 bg-accent/[0.06]" : "border-stroke bg-content/[0.03] hover:border-content/15 hover:bg-content/[0.06]"}`}
      >
        {project ? (
          <ProjectMark path={project} />
        ) : (
          <Kanban className="size-3.5 shrink-0 text-content/55" strokeWidth={1.75} />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-content/85">{project ? projectName(project) : "All projects"}</span>
        <ChevronsUpDown className="size-3 shrink-0 text-content/40" strokeWidth={2} />
      </button>
      {open ? (
        <Popover anchor={trigger} align="start" width={260} role="menu" aria-label="Projects" onDismiss={() => setOpen(false)} className="flex flex-col gap-0.5 p-1.5">
          {allowAll ? (
            <>
              <Row selected={project === null} onClick={() => pick(null)}>
                <Kanban className="size-3.5 shrink-0 text-content/55" strokeWidth={1.75} />
                All projects
              </Row>
              {projects.length ? <div className="my-1 h-px bg-stroke" /> : null}
            </>
          ) : null}
          {projects.map((path) => (
            <Row key={path} selected={project === path} onClick={() => pick(path)}>
              <ProjectMark path={path} />
              <span className="min-w-0 truncate">{projectName(path)}</span>
            </Row>
          ))}
        </Popover>
      ) : null}
    </>
  );
}
