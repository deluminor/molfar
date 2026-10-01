import type { LocalSurfaceId } from "../../../features/home/ui/LocalSurfaceRailActions";

export interface SettingsReturnView {
  search: boolean;
  inbox: boolean;
  notes: boolean;
  automations: boolean;
  localSurface: LocalSurfaceId | null;
}
