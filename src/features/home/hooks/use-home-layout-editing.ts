import { useCallback, useEffect, useState } from "react";
import {
  HOME_LAYOUT_EDIT_MIN_WIDTH_PX,
  NARROW_HOME_LAYOUT,
  loadHomeLayout,
  resetHomeLayout,
  saveHomeLayout,
  type HomeLayout,
} from "../model/home-layout";

const EDIT_MEDIA_QUERY = `(min-width: ${HOME_LAYOUT_EDIT_MIN_WIDTH_PX}px)`;

export type HomeLayoutEditing = {
  layout: HomeLayout;
  editing: boolean;
  canEditLayout: boolean;
  onLayoutChange: (next: HomeLayout) => void;
  onLayoutCommit: (next: HomeLayout) => void;
  onStartEdit: () => void;
  onDoneEdit: () => void;
  onResetLayout: () => void;
};

/** Wide windows edit a persisted layout; narrow ones fall back to a fixed stack. */
export function useHomeLayoutEditing(): HomeLayoutEditing {
  const [wideLayout, setWideLayout] = useState<HomeLayout>(() =>
    loadHomeLayout(),
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

  const onLayoutChange = useCallback((next: HomeLayout): void => {
    setWideLayout(next);
  }, []);

  const onLayoutCommit = useCallback((next: HomeLayout): void => {
    setWideLayout(next);
    saveHomeLayout(next);
  }, []);

  const onStartEdit = useCallback((): void => {
    if (!canEditLayout) return;
    setIsEditing(true);
  }, [canEditLayout]);

  const onDoneEdit = useCallback((): void => {
    setIsEditing(false);
  }, []);

  const onResetLayout = useCallback((): void => {
    setWideLayout(resetHomeLayout());
  }, []);

  return {
    layout: canEditLayout ? wideLayout : NARROW_HOME_LAYOUT,
    editing: isEditing && canEditLayout,
    canEditLayout,
    onLayoutChange,
    onLayoutCommit,
    onStartEdit,
    onDoneEdit,
    onResetLayout,
  };
}
