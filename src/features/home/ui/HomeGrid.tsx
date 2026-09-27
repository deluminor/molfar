import type { ReactNode } from "react";
import ReactGridLayout, {
  useContainerWidth,
  verticalCompactor,
  type Layout,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  HOME_LAYOUT_COLS,
  HOME_LAYOUT_MARGIN,
  HOME_LAYOUT_ROW_HEIGHT,
  normalizeHomeLayout,
  type HomeLayout,
} from "../model/homeLayout";

type Props = {
  layout: HomeLayout;
  isEditing: boolean;
  onLayoutChange: (layout: HomeLayout) => void;
  onLayoutCommit: (layout: HomeLayout) => void;
  clock: ReactNode;
  status: ReactNode;
  brand: ReactNode;
  host: ReactNode;
  sessions: ReactNode;
  automations: ReactNode;
  matrix: ReactNode;
};

const ITEM =
  "home-grid-item grid min-h-0 min-w-0 [&>*]:h-full [&>*]:min-h-0";

/**
 * Home dashboard grid: react-grid-layout with vertical compact/push.
 * Drag and resize only when `isEditing` is true.
 */
export function HomeGrid({
  layout,
  isEditing,
  onLayoutChange,
  onLayoutCommit,
  clock,
  status,
  brand,
  host,
  sessions,
  automations,
  matrix,
}: Props): ReactNode {
  const { width, containerRef, mounted } = useContainerWidth();

  const commitFromRgl = (next: Layout): void => {
    const normalized = normalizeHomeLayout(next);
    onLayoutChange(normalized);
    onLayoutCommit(normalized);
  };

  return (
    <div
      ref={containerRef}
      className={`home-grid w-full ${isEditing ? "is-editing" : ""}`}
    >
      {mounted ? (
        <ReactGridLayout
          className="home-grid-layout"
          width={width}
          layout={layout}
          gridConfig={{
            cols: HOME_LAYOUT_COLS,
            rowHeight: HOME_LAYOUT_ROW_HEIGHT,
            margin: [...HOME_LAYOUT_MARGIN],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: isEditing,
            handle: ".home-card-drag-handle",
          }}
          resizeConfig={{
            enabled: isEditing,
            handles: ["se", "e", "s"],
          }}
          compactor={verticalCompactor}
          onLayoutChange={(next) => {
            if (!isEditing) return;
            onLayoutChange(normalizeHomeLayout(next));
          }}
          onDragStop={(next) => {
            commitFromRgl(next);
          }}
          onResizeStop={(next) => {
            commitFromRgl(next);
          }}
        >
          <div key="clock" className={ITEM}>
            {clock}
          </div>
          <div key="status" className={ITEM}>
            {status}
          </div>
          <div key="brand" className={ITEM}>
            {brand}
          </div>
          <div key="host" className={ITEM}>
            {host}
          </div>
          <div key="sessions" className={ITEM}>
            {sessions}
          </div>
          <div key="automations" className={ITEM}>
            {automations}
          </div>
          <div key="matrix" className={ITEM}>
            {matrix}
          </div>
        </ReactGridLayout>
      ) : null}
    </div>
  );
}
