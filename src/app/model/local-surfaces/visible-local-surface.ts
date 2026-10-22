import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import type { RailSurfaceVisibility } from "@/features/settings/model/project-rail";

export function visibleLocalSurface(
  surface: LocalSurfaceId | null,
  visibility: RailSurfaceVisibility,
): LocalSurfaceId | null {
  if (surface === null || !visibility[surface]) return null;

  return surface;
}
