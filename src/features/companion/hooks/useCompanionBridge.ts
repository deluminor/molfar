import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createCompanionExecutor,
  type CompanionDeps,
} from "../model/companionExecutor";

type CompanionRequestEvent = {
  id: string;
  deviceId: string;
  action: string;
  input: Record<string, unknown>;
};

/**
 * Answers the Companion gateway's requests from this window. The gateway only
 * delivers to the main window, so other windows listen to nothing.
 */
export function useCompanionBridge(deps: CompanionDeps) {
  // The executor reads the latest app state through this, not a stale closure.
  const latest = useRef(deps);
  latest.current = deps;

  useEffect(() => {
    const handle = createCompanionExecutor(
      new Proxy({} as CompanionDeps, {
        get: (_target, key: keyof CompanionDeps) => latest.current[key],
      }),
    );
    const listening = listen<CompanionRequestEvent>(
      "molfar-companion-request",
      ({ payload }) => {
        void handle(payload.action, payload.input)
          .then(
            (result) => ({ ok: true, result }),
            (error: unknown) => ({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          )
          .then((response) =>
            invoke("companion_reply", { id: payload.id, response }),
          )
          .catch(console.error);
      },
    );
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, []);
}
