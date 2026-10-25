import { vi } from "vitest";
import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { SurfaceDeps } from "./surface-deps";

/** Workspace state in a store for the surface flows, with the automations view tracked locally. */
export function setupSurfaces() {
  const store = createWorkspaceStore(testWorkspaceState());
  let automations = false;
  let local: LocalSurfaceId | null = null;
  const deps = {
    store,
    setAutomationsViewOpen: vi.fn((open: boolean) => {
      automations = open;
      if (!open) local = null;
    }),
    setAutomationsSurfaceOpen: vi.fn(),
    setLocalSurface: vi.fn(),
    automationsSurfaceOpen: () => automations,
    localSurface: () => local,
    settingsReturnView: {
      current: { search: false, inbox: false, notes: false, automations: false, localSurface: null },
    },
    rememberAppView: vi.fn(),
    cancelNavigation: vi.fn(),
    closeFamiliarView: vi.fn(),
    setSidebarTab: vi.fn(),
    setComposerFocused: vi.fn(),
    visitBack: vi.fn(),
    visitForward: vi.fn(),
    ensureOpenSession: vi.fn(async () => undefined),
    selectHistorySession: vi.fn(async () => undefined),
  } satisfies SurfaceDeps;
  return { deps, store };
}
