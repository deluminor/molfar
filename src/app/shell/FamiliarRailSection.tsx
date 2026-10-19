import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ImagePlus, MoreHorizontal, Plus, Trash2 } from "../../shared/ui/icons";
import { Popover, type PopoverAnchor } from "../../shared/ui/Popover";
import { Shimmer } from "../../shared/ui/Shimmer";
import { useAnimatedReorder } from "../../shared/hooks/useAnimatedReorder";
import { FamiliarRailMascot } from "../../features/familiars/ui/FamiliarRailMascot";
import { FamiliarIntroCard } from "../../features/familiars/ui/FamiliarIntro";
import { RailAction } from "./RailAction";
import { saveFamiliarsEnabled } from "../../features/settings/model/settings";
import { ProjectBackgroundDialog } from "../../features/projects/ui/ProjectBackgroundDialog";
import { familiarBackgroundKey } from "../../features/familiars/model/familiarBackground";
import {
  ColorPicker,
  MascotPicker,
} from "../../features/familiars/ui/familiarPanelParts";
import {
  defaultFamiliarName,
  findFamiliar,
  listFamiliars,
  FAMILIAR_STATUS_LABEL,
  nextFamiliarLook,
  familiarLook,
  familiarProjectsPhrase,
  familiarsSnapshot,
  familiarWorksOn,
  reorderFamiliars,
  saveFamiliarMascot,
  saveFamiliarName,
  subscribeFamiliars,
  updateFamiliar,
  type FamiliarState,
} from "../../features/familiars/model/familiar";

export type FamiliarRailProps = {
  /** The Familiar open in the main area, if any. */
  activeId?: string;
  /** What each Familiar is doing, by Familiar id; missing reads as idle. */
  states: ReadonlyMap<string, FamiliarState>;
  /** Replies each Familiar has that the user has not looked at yet, by Familiar id. */
  unseenCounts?: ReadonlyMap<string, number>;
  onOpen: (familiarId: string) => void;
  /** Creates a Familiar, given these projects to start with. */
  onCreate: (projects?: readonly string[]) => void;
  onDelete: (familiarId: string) => void;
};

const IDLE: FamiliarState = { status: "idle" };

/** A Familiar's unread count as its badge shows it. */
export function unreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function unreadLabel(count: number): string {
  return count === 1 ? "1 new reply" : `${count} new replies`;
}

/**
 * The user's Familiars, above the projects. Each opens like a project does, but
 * into its conversation; none belongs to a project, so they get a section of
 * their own and the shaded mascot rather than a project's flat one.
 */
export function FamiliarRailSection({
  activeId,
  states,
  unseenCounts,
  onOpen,
  onCreate,
  onDelete,
  project,
}: FamiliarRailProps & {
  /**
   * Lists only the Familiars working on this project, as the inset sidebar does;
   * a Familiar on several projects shows in each of them.
   */
  project?: string;
}) {
  const snapshot = useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  const familiars = useMemo(
    () => listFamiliars().filter((familiar) => !project || familiarWorksOn(familiar, project)),
    [snapshot, project],
  );
  const ids = familiars.map((familiar) => familiar.id);
  const sortable = useAnimatedReorder(ids, reorderFamiliars, "y");
  const [menu, setMenu] = useState<{ id: string; anchor: PopoverAnchor }>();
  const [background, setBackground] = useState<string>();
  const backgroundFamiliar = background ? findFamiliar(background) : undefined;

  // With no Familiar yet, the card stands in for the rail's section. A project
  // with none of its own offers one under the label instead.
  if (familiars.length === 0 && !project)
    return (
      <div className="mb-2 shrink-0" data-familiar-rail>
        <FamiliarIntroCard
          look={nextFamiliarLook(familiars)}
          onCreate={() => onCreate()}
          onHide={() => saveFamiliarsEnabled(false)}
        />
      </div>
    );

  return (
    <div
      className={`shrink-0 ${project ? "px-2 pb-3" : "mb-2"}`}
      data-familiar-rail
      data-familiar-project={project}
    >
      <div
        className={
          // The inset sidebar's section labels.
          project
            ? "flex h-7 items-center gap-1 px-2 text-[12px] font-medium text-content/50"
            : "flex items-center gap-1 px-3 pb-1.5 pt-1"
        }
      >
        <span
          className={`min-w-0 flex-1 truncate${
            project ? "" : " px-1 text-xs leading-5 text-content/50"
          }`}
        >
          Familiars
        </span>
        {familiars.length ? (
          <button
            type="button"
            title="New familiar"
            aria-label="New familiar"
            onClick={() => onCreate(project ? [project] : undefined)}
            className={`grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content${
              project ? " -mr-0.5" : ""
            }`}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <div className={`flex flex-col gap-px${project ? "" : " px-2"}`}>
        {familiars.length === 0 ? (
          <RailAction
            label="New familiar"
            icon={Plus}
            onClick={() => onCreate(project ? [project] : undefined)}
          />
        ) : null}
        {familiars.map((familiar) => {
          const look = familiarLook(familiar);
          const state = states.get(familiar.id) ?? IDLE;
          const selected = familiar.id === activeId;
          const unseen = selected ? 0 : (unseenCounts?.get(familiar.id) ?? 0);
          const projects = look.projects.length
            ? familiarProjectsPhrase(look.projects)
            : "No projects yet";
          const status =
            state.status === "idle"
              ? undefined
              : (state.activity ?? FAMILIAR_STATUS_LABEL[state.status]);
          return (
            <div
              key={familiar.id}
              ref={(el) => sortable.setItemRef(familiar.id, el)}
              data-selected={selected || undefined}
              data-familiar-status={state.status}
              className={`reorder-item project-reorder-item group relative flex h-8 cursor-default touch-none items-stretch rounded-md px-2 ${
                selected ? "bg-selection-strong text-content" : "opacity-65"
              }`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                if (
                  (event.target as HTMLElement | null)?.closest(
                    "[data-no-drag]",
                  )
                )
                  return;
                sortable.onItemPointerDown(familiar.id, event);
              }}
              onClick={(event) => {
                if (
                  (event.target as HTMLElement | null)?.closest(
                    "[data-no-drag]",
                  )
                )
                  return;
                if (sortable.consumeClick()) return;
                onOpen(familiar.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({
                  id: familiar.id,
                  anchor: { x: event.clientX, y: event.clientY },
                });
              }}
            >
              <button
                type="button"
                title={[look.name, projects, status].filter(Boolean).join("\n")}
                aria-label={[
                  look.name,
                  status ?? "idle",
                  unseen ? unreadLabel(unseen) : undefined,
                  projects,
                ]
                  .filter(Boolean)
                  .join(", ")}
                aria-current={selected ? "true" : undefined}
                className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left transition-[padding] duration-150 motion-reduce:transition-none group-hover:pr-6 group-has-[button:focus-visible]:pr-6"
              >
                <FamiliarRailMascot
                  name={look.mascot}
                  color={look.color}
                  status={state.status}
                />
                {state.status === "working" ? (
                  <Shimmer
                    as="span"
                    duration={1.4}
                    className="min-w-0 flex-1 truncate text-sm font-medium leading-tight"
                  >
                    {look.name}
                  </Shimmer>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                    {look.name}
                  </span>
                )}
                {unseen ? (
                  <span
                    aria-hidden
                    data-familiar-unread={unseen}
                    className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent px-1 text-[10px] font-medium tabular-nums leading-none text-white group-hover:hidden group-has-[button:focus-visible]:hidden"
                  >
                    {unreadBadge(unseen)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                data-no-drag
                title="Familiar options"
                aria-label={`${look.name} options`}
                aria-haspopup="menu"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenu({ id: familiar.id, anchor: event.currentTarget });
                }}
                className="absolute right-1 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-content/55 hover:bg-content/8 hover:text-content group-hover:grid group-has-[button:focus-visible]:grid"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
      {menu ? (
        <FamiliarMenu
          key={menu.id}
          familiarId={menu.id}
          anchor={menu.anchor}
          onBackground={() => {
            setMenu(undefined);
            setBackground(menu.id);
          }}
          onDelete={() => {
            setMenu(undefined);
            onDelete(menu.id);
          }}
          onClose={() => setMenu(undefined)}
        />
      ) : null}
      {backgroundFamiliar ? (
        <ProjectBackgroundDialog
          project={familiarBackgroundKey(backgroundFamiliar.id)}
          name={familiarLook(backgroundFamiliar).name}
          locked
          onClose={() => setBackground(undefined)}
        />
      ) : null}
    </div>
  );
}

/**
 * Right-click menu for a Familiar, like a project's: its name, mascot and color
 * up top, edited in place, then the actions.
 */
function FamiliarMenu({
  familiarId,
  anchor,
  onBackground,
  onDelete,
  onClose,
}: {
  familiarId: string;
  anchor: PopoverAnchor;
  onBackground: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  const familiar = findFamiliar(familiarId);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(familiar?.name ?? "");

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  if (!familiar) return null;
  const look = familiarLook(familiar);
  const commitName = () => {
    const next = name.trim().slice(0, 40);
    if (next !== (findFamiliar(familiarId)?.name ?? "")) saveFamiliarName(familiarId, next);
  };

  return (
    <Popover
      anchor={anchor}
      side="right"
      align="start"
      gap={0}
      width={280}
      constrainHeight={false}
      onDismiss={() => {
        commitName();
        onClose();
      }}
      role="menu"
      aria-label="Familiar options"
      onContextMenu={(event) => event.preventDefault()}
      className="p-2"
    >
      <input
        ref={input}
        value={name}
        placeholder={defaultFamiliarName(familiar.mascot)}
        maxLength={40}
        aria-label="Familiar name"
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitName();
          onClose();
        }}
        className="mb-2 w-full rounded-lg border border-content/10 bg-content/5 px-2.5 py-1.5 text-[13px] text-content outline-none ring-accent/40 placeholder:text-content/45 focus:ring-1"
      />
      <div className="mb-2 flex flex-col gap-2">
        <MascotPicker
          current={look.mascot}
          color={look.color}
          onPick={(mascot) => saveFamiliarMascot(familiarId, mascot)}
        />
        <ColorPicker
          inline
          current={look.color}
          onPick={(color) => updateFamiliar(familiarId, (familiar) => ({ ...familiar, color }))}
        />
      </div>
      <div role="separator" className="my-1 h-px bg-content/10" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          commitName();
          onBackground();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-content/85 hover:bg-content/8"
      >
        <ImagePlus className="size-3.5 shrink-0" strokeWidth={1.75} />
        Background image
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-400 hover:bg-content/8"
      >
        <Trash2 className="size-3.5 shrink-0" strokeWidth={1.75} />
        Delete familiar…
      </button>
    </Popover>
  );
}
