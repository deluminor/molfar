import type { ReactNode } from "react";
import { useDragResize } from "@/shared/hooks/use-drag-resize";

const MIN_WIDTH = 380;
const DEFAULT_WIDTH = 520;

/** The card panel beside the board: resizable like the Familiar sidebars, width remembered. */
export function DetailPanelFrame({ label, children }: { label: string; children: ReactNode }): ReactNode {
  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(1100, Math.round(window.innerWidth * 0.66)),
    defaultWidth: DEFAULT_WIDTH,
    initial: DEFAULT_WIDTH,
    direction: "left",
    storageKey: "molfar.taskBoard.detailWidth",
  });

  return (
    <aside
      ref={resize.setPaneRef}
      aria-label={label}
      className="task-board-panel relative flex h-full min-h-0 shrink-0 flex-col border-l border-stroke bg-content/[0.012] font-sans"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize card panel"
        className={`absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none transition-colors duration-150 ${resize.dragging ? "bg-accent/30" : "hover:bg-content/10"}`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
      {children}
    </aside>
  );
}
