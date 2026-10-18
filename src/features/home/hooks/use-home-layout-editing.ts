import { useCallback, useEffect, useState } from "react";
import {
  HOME_LAYOUT_EDIT_MIN_WIDTH_PX,
  NARROW_HOME_LAYOUT,
  canHideHomeWidget,
  hideHomeWidget,
  loadHomeLayoutState,
  mergeHomeLayout,
  resetHomeLayoutState,
  saveHomeLayoutState,
  showHomeWidget,
  visibleHomeLayout,
  type HomeLayout,
  type HomeLayoutUpdate,
  type HomeLayoutState,
  type HomeWidgetId,
} from "../model/home-layout";

const EDIT_MEDIA_QUERY = `(min-width: ${HOME_LAYOUT_EDIT_MIN_WIDTH_PX}px)`;

export type HomeLayoutEditing = {
  /** Visible items only; hidden widgets are never handed to the grid. */
  layout: HomeLayout;
  hidden: readonly HomeWidgetId[];
  editing: boolean;
  canEditLayout: boolean;
  canHideWidget: (id: HomeWidgetId) => boolean;
  onLayoutChange: (next: readonly HomeLayoutUpdate[]) => void;
  onLayoutCommit: (next: readonly HomeLayoutUpdate[]) => void;
  onHideWidget: (id: HomeWidgetId) => void;
  onShowWidget: (id: HomeWidgetId) => void;
  onStartEdit: () => void;
  onDoneEdit: () => void;
  onResetLayout: () => void;
};

/** Wide windows edit a persisted layout; narrow ones fall back to a fixed stack. */
export function useHomeLayoutEditing(): HomeLayoutEditing {
  const [state, setState] = useState<HomeLayoutState>(() =>
    loadHomeLayoutState(),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [canEditLayout, setCanEditLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(EDIT_MEDIA_QUERY).matches
      : true,
  );

  useEffect(() => {
    const media = window.matchMedia(EDIT_MEDIA_QUERY);
    const sync = (): void => {
      setCanEditLayout(media.matches);
      if (!media.matches) setIsEditing(false);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const update = useCallback(
    (next: (current: HomeLayoutState) => HomeLayoutState, persist: boolean) => {
      setState((current) => {
        const updated = next(current);
        if (!persist || updated === current) return updated;
        return saveHomeLayoutState(updated) ? updated : current;
      });
    },
    [],
  );

  const onLayoutChange = useCallback(
    (next: readonly HomeLayoutUpdate[]): void => {
      update((s) => ({ ...s, layout: mergeHomeLayout(s.layout, next) }), false);
    },
    [update],
  );

  const onLayoutCommit = useCallback(
    (next: readonly HomeLayoutUpdate[]): void => {
      update((s) => ({ ...s, layout: mergeHomeLayout(s.layout, next) }), true);
    },
    [update],
  );

  const onHideWidget = useCallback(
    (id: HomeWidgetId): void => update((s) => hideHomeWidget(s, id), true),
    [update],
  );

  const onShowWidget = useCallback(
    (id: HomeWidgetId): void => update((s) => showHomeWidget(s, id), true),
    [update],
  );

  const canHideWidget = useCallback(
    (id: HomeWidgetId): boolean => canHideHomeWidget(state, id),
    [state],
  );

  const onStartEdit = useCallback((): void => {
    if (!canEditLayout) return;
    setIsEditing(true);
  }, [canEditLayout]);

  const onDoneEdit = useCallback((): void => {
    setIsEditing(false);
  }, []);

  const onResetLayout = useCallback((): void => {
    const next = resetHomeLayoutState();
    if (next) setState(next);
  }, []);

  return {
    layout: visibleHomeLayout(
      state,
      canEditLayout ? state.layout : NARROW_HOME_LAYOUT,
    ),
    hidden: state.hidden,
    editing: isEditing && canEditLayout,
    canEditLayout,
    canHideWidget,
    onLayoutChange,
    onLayoutCommit,
    onHideWidget,
    onShowWidget,
    onStartEdit,
    onDoneEdit,
    onResetLayout,
  };
}
