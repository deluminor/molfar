import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type { ControlRequest } from "../flows/agent-app/control-requests";

/** Listens for CLI requests from agents and replies with the handler's result or error. */
export function useControlRequests(handle: (payload: ControlRequest) => Promise<unknown>): void {
  useEffect(() => {
    const listening = listen<ControlRequest>("molfar-control-request", ({ payload }) => {
      void handle(payload)
        .then(
          (result) => invoke("control_reply", { id: payload.id, response: { ok: true, result } }),
          (error: unknown) =>
            invoke("control_reply", {
              id: payload.id,
              response: { ok: false, error: error instanceof Error ? error.message : String(error) },
            }),
        )
        .catch(console.error);
    });
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, [handle]);
}
