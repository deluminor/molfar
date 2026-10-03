import type { ReactNode } from "react";
import {
  ChevronRight,
  File,
  Folder,
  Plus,
  Wrench,
} from "@/shared/ui/icons";
import type { ConfluenceNode } from "../../model/confluence/types";

type Props = {
  node: ConfluenceNode;
  depth: number;
  selected: boolean;
  expanded: boolean;
  expandable: boolean;
  onSelect: () => void;
  onToggle?: () => void;
  onSend?: () => void;
};

function NodeIcon({ kind }: { kind: ConfluenceNode["kind"] }): ReactNode {
  const className = "size-3.5 shrink-0 text-content/45";

  if (kind === "folder") {
    return <Folder className={className} strokeWidth={1.75} />;
  }

  if (kind === "whiteboard" || kind === "database" || kind === "embed") {
    return <Wrench className={className} strokeWidth={1.75} />;
  }

  return <File className={className} strokeWidth={1.75} />;
}

export function TreeRow({
  node,
  depth,
  selected,
  expanded,
  expandable,
  onSelect,
  onToggle,
  onSend,
}: Props): ReactNode {
  return (
    <div
      className={`group flex min-w-0 items-center gap-0.5 rounded-md ${
        selected ? "bg-selection text-content" : "hover:bg-content/5"
      }`}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          className="grid size-6 shrink-0 place-items-center rounded text-content/45 hover:text-content"
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            strokeWidth={1.75}
          />
        </button>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center text-[10px] text-content/30">
          •
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left"
      >
        <NodeIcon kind={node.kind} />
        <span className="min-w-0 truncate text-[12px] leading-tight">
          {node.title}
        </span>
      </button>
      {onSend ? (
        <button
          type="button"
          title="Send to chat"
          aria-label={`Send ${node.title} to chat`}
          onClick={(event) => {
            event.stopPropagation();
            onSend();
          }}
          className="mr-0.5 grid size-6 shrink-0 place-items-center rounded text-content/40 opacity-0 hover:bg-content/10 hover:text-content group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
