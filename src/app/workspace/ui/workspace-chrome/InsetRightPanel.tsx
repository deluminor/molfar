import { RIGHT_PANEL_WIDTH_MAX, RIGHT_PANEL_WIDTH_MIN } from "@/features/settings/model/appearance";
import type { useDragResize } from "@/shared/hooks/use-drag-resize";

type Props = {
  shown: boolean;
  closing: boolean;
  resize: ReturnType<typeof useDragResize>;
  onPane: (pane: HTMLDivElement | null) => void;
  /** Where the sidebar portals Explorer or Changes. */
  onHost: (host: HTMLDivElement | null) => void;
};

/** Part of the inset card: the project tools beside the workspace, behind a hairline. */
export function InsetRightPanel({ shown, closing, resize, onPane, onHost }: Props) {
  return (
    <div
      ref={onPane}
      inert={closing || undefined}
      className={
        shown
          ? "relative flex h-full shrink-0 flex-col overflow-hidden border-l border-stroke"
          : "hidden"
      }
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: the Sidebar portals its labelled tool panel into this host */}
      <div ref={onHost} aria-label="Project tools" className="flex min-h-0 flex-1 flex-col" />
      {/* biome-ignore lint/a11y/useSemanticElements: a draggable sash with a value, which an <hr> cannot be */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right sidebar"
        aria-valuenow={resize.width}
        aria-valuemin={RIGHT_PANEL_WIDTH_MIN}
        aria-valuemax={RIGHT_PANEL_WIDTH_MAX}
        className={`absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </div>
  );
}
