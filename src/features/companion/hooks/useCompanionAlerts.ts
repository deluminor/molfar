import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Familiar } from "../../familiars/model/familiar";
import type { Session } from "../../sessions/model/session";
import { companionAlerts } from "../model/companionAlerts";

const SEEN_MAX = 500;

/**
 * Pushes each new approval or question to paired phones once. Rust decides
 * whether any phone wants it (gateway on, a push token, the window away).
 */
export function useCompanionAlerts(
  sessions: readonly Session[],
  familiars: readonly Familiar[],
) {
  const seen = useRef(new Set<string>());

  useEffect(() => {
    for (const alert of companionAlerts(sessions, familiars)) {
      if (seen.current.has(alert.key)) continue;
      seen.current.add(alert.key);
      void invoke("companion_notify", {
        title: alert.title,
        body: alert.body,
        data: { molfar: alert.target },
      }).catch(() => {});
    }
    if (seen.current.size > SEEN_MAX) {
      seen.current = new Set([...seen.current].slice(-SEEN_MAX / 2));
    }
  }, [sessions, familiars]);
}
