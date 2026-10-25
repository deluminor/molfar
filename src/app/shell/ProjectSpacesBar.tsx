import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CurrentProjectIcon,
  useProjectLabel,
} from "@/features/projects/ui/CurrentProjectIcon";
import { sameProjectPath } from "@/features/projects/model/recents";
import {
  keybindingShortcutLabel,
  subscribeKeybindings,
} from "@/features/settings/model/settings";
import { isContextMenuKey } from "@/shared/lib/keyboard";
import { MOD, SHIFT } from "@/shared/lib/platform";
import { ChevronLeft, ChevronRight } from "@/shared/ui/icons";
import { useRailTooltip } from "./RailTooltip";

export function projectPathBusy(
  paths: Iterable<string> | undefined,
  cwd: string,
): boolean {
  if (!paths) return false;
  for (const path of paths) {
    if (sameProjectPath(path, cwd)) return true;
  }
  return false;
}

/** Zen-style spaces at the foot of the inset sidebar: each project's logo or
 * mascot, the current one lifted, and a way to open another. */
/** Projects the spaces bar shows at once; the chevrons page through more. */
const SPACES_SHOWN = 5;

export function ProjectSpacesBar({
  projects,
  cwd,
  busyProjectPaths,
  onSelectProject,
  onProjectContextMenu,
}: {
  projects: readonly string[];
  cwd: string;
  busyProjectPaths?: Iterable<string>;
  onSelectProject: (path: string) => void;
  onProjectContextMenu: (
    path: string,
    x: number,
    y: number,
    trigger: HTMLElement,
  ) => void;
}) {
  const projectTooltip = useRailTooltip("top");
  const shortcuts = useSyncExternalStore(subscribeKeybindings, () =>
    [
      keybindingShortcutLabel("Project: Previous", `${MOD}${SHIFT}←`),
      keybindingShortcutLabel("Project: Next", `${MOD}${SHIFT}→`),
    ]
      .filter(Boolean)
      .join(" / "),
  );
  const shown = Math.min(projects.length, SPACES_SHOWN);
  const lastStart = Math.max(0, projects.length - shown);
  const activeIndex = projects.findIndex((path) => sameProjectPath(path, cwd));
  const [start, setStart] = useState(() =>
    Math.min(lastStart, Math.max(0, activeIndex - shown + 1)),
  );
  // Bring the current project into view when it changes from elsewhere,
  // moving the window no further than it needs to.
  useEffect(() => {
    if (activeIndex < 0) return;
    setStart((current) =>
      activeIndex < current
        ? activeIndex
        : activeIndex >= current + shown
          ? activeIndex - shown + 1
          : current,
    );
  }, [activeIndex, shown]);
  const first = Math.min(start, lastStart);
  const visible = projects.slice(first, first + shown);
  const rowRef = useRef<HTMLDivElement>(null);
  const step = (direction: -1 | 1) => {
    const next = Math.min(lastStart, Math.max(0, first + direction));
    if (next === first) return;
    setStart(next);
    // A short slide in from the side the new project comes from.
    const row = rowRef.current;
    if (
      !row ||
      typeof row.animate !== "function" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    row.animate(
      [
        { transform: `translateX(${direction * 12}px)`, opacity: 0.4 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 200, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
  };
  const chevron = (direction: -1 | 1) => {
    const disabled = direction < 0 ? first <= 0 : first >= lastStart;
    const Icon = direction < 0 ? ChevronLeft : ChevronRight;
    const label = direction < 0 ? "Previous projects" : "More projects";
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        data-tauri-drag-region="false"
        onClick={() => step(direction)}
        className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content disabled:pointer-events-none disabled:opacity-30"
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
      </button>
    );
  };
  return (
    // As tall as the usage footer beside it, so the two read as one strip.
    // A mini carousel: up to five spaces spread evenly, chevrons either side.
    // Its edges line up with the rows above, and its controls with the usage
    // footer's; each space takes an equal share.
    <div
      {...projectTooltip.handlers}
      className="flex h-[30px] shrink-0 items-center gap-1 px-2 pb-0.5"
    >
      {chevron(-1)}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          ref={rowRef}
          role="tablist"
          aria-label="Projects"
          className="flex w-full items-center gap-1"
        >
          {visible.map((path) => (
            <ProjectSpaceButton
              key={path}
              path={path}
              active={sameProjectPath(path, cwd)}
              busy={projectPathBusy(busyProjectPaths, path)}
              shortcuts={shortcuts}
              onSelect={() => onSelectProject(path)}
              onContextMenu={(x, y, trigger) =>
                onProjectContextMenu(path, x, y, trigger)
              }
            />
          ))}
        </div>
      </div>
      {chevron(1)}
      {projectTooltip.tooltip}
    </div>
  );
}

function ProjectSpaceButton({
  path,
  active,
  busy,
  shortcuts,
  onSelect,
  onContextMenu,
}: {
  path: string;
  active: boolean;
  busy: boolean;
  shortcuts: string;
  onSelect: () => void;
  onContextMenu: (x: number, y: number, trigger: HTMLElement) => void;
}) {
  const label = useProjectLabel(path);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={busy ? `${label}, working` : label}
      data-rail-tip={label}
      data-rail-tip-detail={shortcuts || undefined}
      data-tauri-drag-region="false"
      onClick={active ? undefined : onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        onContextMenu(event.clientX, event.clientY, event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (!isContextMenuKey(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onContextMenu(rect.left, rect.bottom, event.currentTarget);
      }}
      className={`relative grid h-5 min-w-0 flex-1 place-items-center rounded-md transition-[opacity,background-color] duration-200 ease-out motion-reduce:transition-none ${
        active
          ? "bg-content/10 opacity-100"
          : "opacity-45 hover:bg-content/5 hover:opacity-100"
      }`}
    >
      <CurrentProjectIcon
        cwd={path}
        busy={busy}
        className="size-3"
        mascotClassName="size-2.5"
      />
      {busy && !active ? (
        <span
          aria-hidden
          className="absolute right-1 top-0.5 size-1.5 rounded-full bg-accent"
        />
      ) : null}
    </button>
  );
}
