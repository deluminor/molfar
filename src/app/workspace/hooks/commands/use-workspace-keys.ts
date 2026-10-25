import { useEffect } from "react";
import { resolveZoomKeybinding } from "@/features/settings/model/zoom-keybinding";
import { handleAppShortcutKey, handleEditorFind } from "./app-shortcut-key";
import type { CommandDeps } from "./command-deps";
import { handleTabCommandKey } from "./tab-command-key";
import { zoomUi } from "./ui-zoom";

function handleKey(deps: CommandDeps, event: KeyboardEvent): void {
  // The Quick Composer recorder owns the next key combination, including
  // bindings that the workspace would normally handle in capture phase.
  // It records only while focused, so check the focused element: a
  // document-wide query walked the whole DOM on every keystroke.
  if (document.activeElement?.getAttribute("data-shortcut-recorder-active") === "true") return;
  // Never act on a chord while an IME is composing: tabCommand and the
  // editor guards already do, and the app shortcut resolver does too, so
  // this keeps the whole handler consistent for whatever is added next.
  if (event.isComposing) return;

  // A rebound zoom chord may be Option-only, so it is resolved outside the
  // Cmd/Ctrl guard that only the browser-standard defaults need.
  const zoom = resolveZoomKeybinding(event);
  // An image preview under the pointer zooms the image instead; its own
  // listener runs next.
  if (zoom && document.querySelector("[data-image-zoom]")) return;
  if (zoom) {
    event.preventDefault();
    event.stopPropagation();
    zoomUi(zoom);
    return;
  }

  if (handleTabCommandKey(deps, event)) return;
  if (handleEditorFind(deps, event)) return;
  handleAppShortcutKey(deps, event);
}

/** Workspace keyboard shortcuts, in capture phase so they win over focused panes. */
export function useWorkspaceKeys(deps: CommandDeps): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleKey(deps, event);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deps]);
}
