import { useRef } from "react";
import type { MobileCommandDeps } from "../flows/mobile/mobile-command-types";
import { useMobileWorkspace } from "@/features/mobile/hooks/use-mobile-workspace";
import type { Session } from "@/domain/session/session";
import { runMobileCommand } from "../flows/mobile/mobile-commands";

/** Serves paired phones (Settings → Connections → Your phones) from this window's workspace. */
export function useWorkspaceMobile(
  sessions: readonly Session[],
  deps: MobileCommandDeps,
): void {
  const usagePending = useRef(new Set<string>());

  useMobileWorkspace({
    sessions,
    defaultRuntimeMode: deps.defaultRuntimeMode,
    command: (method, params, commandId) =>
      runMobileCommand({ ...deps, usagePending: usagePending.current }, method, params, commandId),
  });
}
