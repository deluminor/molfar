import type { ReactNode } from "react";
import type { IconComponent } from "./icons";

/**
 * An icon that, while selected, opens out into its name and count, and folds
 * back into the icon when it is not.
 */
export function FoldingTab({
  label,
  icon: Icon,
  selected,
  count,
  dot = false,
  onClick,
  ...aria
}: {
  label: string;
  icon: IconComponent;
  selected: boolean;
  count?: number;
  dot?: boolean;
  onClick: () => void;
  role?: "tab";
  "aria-selected"?: boolean;
  "aria-pressed"?: boolean;
  "aria-label": string;
}): ReactNode {
  return (
    <button
      type="button"
      {...aria}
      title={aria["aria-label"]}
      data-tauri-drag-region="false"
      onClick={onClick}
      className={`flex h-6 items-center rounded-md px-2 text-[12px] transition-colors duration-200 ${
        selected
          ? "bg-content/8 text-content"
          : "text-content/45 hover:bg-content/5 hover:text-content/80"
      }`}
    >
      {dot ? (
        <span className="relative grid shrink-0" data-changes-dot>
          <Icon
            className="overview-tab-icon-with-dot size-3.5"
            strokeWidth={1.75}
          />
          <span
            aria-hidden
            className="absolute -top-0.5 left-2.5 size-1.5 rounded-full bg-accent"
          />
        </span>
      ) : (
        <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      )}
      <span
        aria-hidden={!selected}
        data-tab-label={selected ? "open" : "closed"}
        className={`grid transition-[grid-template-columns,opacity] duration-200 ease-out motion-reduce:transition-none ${
          selected ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <span className="pl-1.5">{label}</span>
          {count ? (
            <span className="min-w-4 rounded bg-accent px-1 text-center text-[10px] font-medium leading-4 tabular-nums text-white">
              {count}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
