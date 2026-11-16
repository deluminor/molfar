import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import {
  loadRailSurfaces,
  RAIL_SURFACES_DEFAULT,
  subscribeRailSurfaces,
} from "@/features/settings/model/project-rail";
import type { LocalSurfaceState } from "./types";
import { visibleLocalSurface } from "./visible-local-surface";

export function useLocalSurfaceState(): LocalSurfaceState {
  const [automationsSurfaceOpen, setAutomationsSurfaceOpen] = useState(false);
  const [automationsFocusId, setAutomationsFocusId] = useState<string | null>(
    null,
  );
  const [localSurface, setLocalSurface] = useState<LocalSurfaceId | null>(null);
  const railSurfaces = useSyncExternalStore(
    subscribeRailSurfaces,
    loadRailSurfaces,
    () => RAIL_SURFACES_DEFAULT,
  );

  const automationsSurfaceOpenRef = useRef(automationsSurfaceOpen);
  automationsSurfaceOpenRef.current = automationsSurfaceOpen;
  const localSurfaceRef = useRef(localSurface);
  localSurfaceRef.current = localSurface;

  const setAutomationsViewOpen = useCallback((open: boolean) => {
    setLocalSurface(null);
    if (!open) setAutomationsFocusId(null);
    setAutomationsSurfaceOpen(open);
  }, []);

  useEffect(() => {
    const visible = visibleLocalSurface(localSurface, railSurfaces);
    if (visible !== localSurface) setLocalSurface(visible);
  }, [localSurface, railSurfaces]);

  return {
    localSurface,
    setLocalSurface,
    localSurfaceRef,
    automationsSurfaceOpen,
    setAutomationsSurfaceOpen,
    automationsSurfaceOpenRef,
    automationsFocusId,
    setAutomationsFocusId,
    automationsViewOpen: automationsSurfaceOpen || localSurface !== null,
    setAutomationsViewOpen,
    railSurfaces,
  };
}
