import type { ReactNode } from "react";
import { useDragResize } from "../../../../shared/hooks/useDragResize";
import {
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_RATIO,
  SIDE_PANEL_MIN_WIDTH,
} from "../constants";

let rememberedWidth = SIDE_PANEL_DEFAULT_WIDTH;

export function KnowledgeSidePanel({ children }: { children: ReactNode }) {
  const resize = useDragResize({
    direction: "left",
    min: SIDE_PANEL_MIN_WIDTH,
    max: () => Math.round(window.innerWidth * SIDE_PANEL_MAX_RATIO),
    defaultWidth: SIDE_PANEL_DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (width) => {
      rememberedWidth = width;
    },
  });

  return (
    <div className="knowledge-side-panel" ref={resize.setPaneRef}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize note panel"
        className="knowledge-side-panel-handle"
        data-dragging={resize.dragging}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
      {children}
    </div>
  );
}
