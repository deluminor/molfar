import { useMemo, type ReactNode } from "react";
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
  type HomeLayout,
  type HomeLayoutUpdate,
  type HomeWidgetId,
} from "../model/homeLayout";
import { HOME_WIDGET_LABELS } from "../model/homeWidgetRegistry";
import { HomeCardEditContext, type HomeCardEdit } from "./HomeCardEditContext";

export type HomeWidgets = Record<HomeWidgetId, ReactNode>;

type Props = {
  /** Visible items only; widgets outside it are never mounted. */
  layout: HomeLayout;
  widgets: HomeWidgets;
  isEditing: boolean;
  canHideWidget: (id: HomeWidgetId) => boolean;
  onHideWidget: (id: HomeWidgetId) => void;
  onLayoutChange: (layout: readonly HomeLayoutUpdate[]) => void;
  onLayoutCommit: (layout: readonly HomeLayoutUpdate[]) => void;
};

const ITEM = "home-grid-item grid min-h-0 min-w-0 [&>*]:h-full [&>*]:min-h-0";

export function HomeGrid({
  layout,
  widgets,
  isEditing,
  canHideWidget,
  onHideWidget,
  onLayoutChange,
  onLayoutCommit,
}: Props): ReactNode {
  const { width, containerRef, mounted } = useContainerWidth();

  const editById = useMemo(() => {
    if (!isEditing) return null;
    const byId = new Map<HomeWidgetId, HomeCardEdit>();
    for (const item of layout) {
      byId.set(item.i, {
        label: HOME_WIDGET_LABELS[item.i],
        canHide: canHideWidget(item.i),
        onHide: () => onHideWidget(item.i),
      });
    }
    return byId;
  }, [isEditing, layout, canHideWidget, onHideWidget]);

  const commitFromRgl = (next: Layout): void => {
    onLayoutChange(next);
    onLayoutCommit(next);
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
            cancel: ".home-brand-selector, .home-card-edit-control",
          }}
          resizeConfig={{
            enabled: isEditing,
            handles: ["se", "e", "s"],
          }}
          compactor={verticalCompactor}
          onLayoutChange={(next) => {
            if (!isEditing) return;
            onLayoutChange(next);
          }}
          onDragStop={(next) => {
            commitFromRgl(next);
          }}
          onResizeStop={(next) => {
            commitFromRgl(next);
          }}
        >
          {layout.map((item) => (
            <div key={item.i} className={ITEM}>
              <HomeCardEditContext.Provider
                value={editById?.get(item.i) ?? null}
              >
                {widgets[item.i]}
              </HomeCardEditContext.Provider>
            </div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}
