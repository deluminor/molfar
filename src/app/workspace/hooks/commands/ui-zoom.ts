import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "@/features/settings/model/ui-scale";
import type { ZoomAction } from "@/features/settings/model/zoom-keybinding";

/** Zooms the whole app UI one step, or back to its default size. */
export function zoomUi(action: ZoomAction): void {
  let scale = UI_SCALE_DEFAULT;
  if (action === "zoom-in") scale = zoomInUiScale(loadUiScale());
  if (action === "zoom-out") scale = zoomOutUiScale(loadUiScale());
  void applyUiScale(saveUiScale(scale));
}
