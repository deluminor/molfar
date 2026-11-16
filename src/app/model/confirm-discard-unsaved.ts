import { confirmApp } from "@/shared/lib/app-dialog";

/** In-app confirm. `window.confirm` is swallowed when a macOS menu accelerator fires. */
export function confirmDiscardUnsaved(message: string): Promise<boolean> {
  return confirmApp(message, { kind: "warning" });
}
