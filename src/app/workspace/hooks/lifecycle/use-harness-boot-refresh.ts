import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import {
  isLiveHarness,
  probeHarnessAvailability,
  refreshHarnessCatalogs,
} from "@/integrations/harness";
import type { WorkspaceSessions } from "../use-workspace-sessions";

/** At boot: probes harness availability, then resolves the restored chats' models against the live catalogs. */
export function useHarnessBootRefresh(
  sessionsRef: { readonly current: Session[] },
  setSessions: WorkspaceSessions["setSessions"],
): void {
  useEffect(() => {
    void probeHarnessAvailability();
    // Only the harnesses already in this window. Probing every installed CLI
    // at boot left unused agents (especially Pi) running in the background.
    const harnesses = [
      ...new Set(sessionsRef.current.map((session) => session.harness)),
    ];
    void refreshHarnessCatalogs(harnesses).then(() => {
      setSessions((prev) =>
        prev.map((session) => {
          if (!isLiveHarness(session.harness)) return session;
          const resolved = resolveModel(session.harness, session.model);
          const modelSettings = mergeModelSettings(
            resolved,
            session.modelSettings,
          );
          if (
            resolved.id === session.model &&
            sameSettings(modelSettings, session.modelSettings)
          ) {
            return session;
          }
          return { ...session, model: resolved.id, modelSettings };
        }),
      );
    });
  }, [sessionsRef, setSessions]);
}

function sameSettings(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
