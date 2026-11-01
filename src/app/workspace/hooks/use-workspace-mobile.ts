import type { MobileCommandDeps } from "../flows/mobile/mobile-command-types";
import { useMobileWorkspace } from "@/features/mobile/hooks/use-mobile-workspace";
import type { Session } from "@/domain/session/session";
import { runMobileCommand } from "../flows/mobile/mobile-commands";

/** Serves paired phones (Settings → Connections → Your phones) from this window's workspace. */
export function useWorkspaceMobile(
  sessions: readonly Session[],
  deps: MobileCommandDeps,
): void {
  useMobileWorkspace({
    sessions,
    defaultRuntimeMode: deps.defaultRuntimeMode,
    command: (method, params, commandId) =>
      runMobileCommand(deps, method, params, commandId),
  });
}
