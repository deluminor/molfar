import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { loadAutosave, loadKeybindingOverrides } from "@/features/settings/model/settings";
import { IS_MAC } from "@/shared/lib/platform";

/** The macOS menu holds autosave and the rebound accelerators; it learns them at launch. */
export function useNativeKeybindings(): void {
  useEffect(() => {
    if (!IS_MAC) return;
    void invoke("autosave_set_enabled", { enabled: loadAutosave() }).catch(console.error);
    void invoke("keybindings_set_overrides", { overrides: loadKeybindingOverrides() }).catch(console.error);
  }, []);
}
