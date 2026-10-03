import { useCallback, useMemo } from "react";
import {
  LocalSurfaceRailActions,
  type LocalSurfaceId,
} from "@/features/home/ui/LocalSurfaceRailActions";
import type { LocalSurfaceActionDeps, LocalSurfaceActions } from "./types";

export function useLocalSurfaceActions({
  surfaces,
  setFilePickerOpen,
  setSettingsOpen,
  setSearchViewOpen,
  setInboxViewOpen,
  setNotesViewOpen,
  setSidebarTab,
  sessionsRef,
  history,
  onSelectHistorySession,
}: LocalSurfaceActionDeps): LocalSurfaceActions {
  const {
    localSurface,
    setLocalSurface,
    setAutomationsSurfaceOpen,
    setAutomationsFocusId,
    setAutomationsViewOpen,
    railSurfaces,
  } = surfaces;

  const onOpenLocalSurface = useCallback(
    (id: LocalSurfaceId) => {
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsSurfaceOpen(false);
      setLocalSurface(id);
    },
    [
      setFilePickerOpen,
      setSettingsOpen,
      setSearchViewOpen,
      setInboxViewOpen,
      setNotesViewOpen,
      setAutomationsSurfaceOpen,
      setLocalSurface,
    ],
  );

  const onOpenKnowledge = useCallback(
    () => onOpenLocalSurface("knowledge"),
    [onOpenLocalSurface],
  );

  const onLeaveLocalSurface = useCallback(() => {
    setLocalSurface(null);
  }, [setLocalSurface]);

  const onOpenHomeSession = useCallback(
    (sessionId: string) => {
      setLocalSurface(null);
      const cwd =
        sessionsRef.current.find((session) => session.id === sessionId)?.cwd ??
        history.find((session) => session.id === sessionId)?.cwd;
      setSidebarTab("sessions", cwd);
      void onSelectHistorySession(sessionId);
    },
    [
      setLocalSurface,
      sessionsRef,
      history,
      setSidebarTab,
      onSelectHistorySession,
    ],
  );

  const onOpenHomeAutomation = useCallback(
    (automationId: string) => {
      setAutomationsFocusId(automationId);
      setAutomationsViewOpen(true);
    },
    [setAutomationsFocusId, setAutomationsViewOpen],
  );

  const onAutomationsFocusConsumed = useCallback(() => {
    setAutomationsFocusId(null);
  }, [setAutomationsFocusId]);

  const localSurfaceRailActions = useMemo(
    () => (
      <LocalSurfaceRailActions
        active={localSurface}
        visible={railSurfaces}
        onOpen={onOpenLocalSurface}
      />
    ),
    [localSurface, railSurfaces, onOpenLocalSurface],
  );

  return {
    onOpenLocalSurface,
    onOpenKnowledge,
    onLeaveLocalSurface,
    onOpenHomeSession,
    onOpenHomeAutomation,
    onAutomationsFocusConsumed,
    localSurfaceRailActions,
  };
}
