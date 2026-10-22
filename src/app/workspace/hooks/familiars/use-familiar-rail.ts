import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Session } from "@/domain/session/session";
import {
  type FamiliarState,
  familiarState,
  familiarsSnapshot,
  listFamiliars,
  subscribeFamiliars,
} from "@/features/familiars/model/familiar";
import { useStableValue } from "@/shared/hooks/use-stable-value";
import type { FamiliarRailProps } from "../../../shell/FamiliarRailSection";

export type FamiliarRailDeps = {
  enabled: boolean;
  activeId: string | undefined;
  sessions: readonly Session[];
  /** Unseen replies by session id. */
  unseenReplies: ReadonlyMap<string, number>;
  onOpen(familiarId: string): Promise<void>;
  onCreate(): void;
  onDelete(familiarId: string): Promise<void>;
};

/** The sidebar's Familiars: what each is doing and its unseen replies. */
export function useFamiliarRail({
  enabled,
  activeId,
  sessions,
  unseenReplies,
  onOpen,
  onCreate,
  onDelete,
}: FamiliarRailDeps): FamiliarRailProps | undefined {
  const familiarsSnap = useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the roster is read through its snapshot.
  const railState = useMemo(() => {
    const states = new Map<string, FamiliarState>();
    const unseen = new Map<string, number>();
    for (const familiar of listFamiliars()) {
      const session = familiar.sessionId
        ? sessions.find((entry) => entry.id === familiar.sessionId)
        : undefined;
      if (session) states.set(familiar.id, familiarState(session));
      const count = familiar.sessionId ? unseenReplies.get(familiar.sessionId) : undefined;
      if (count) unseen.set(familiar.id, count);
    }
    return { states, unseen };
  }, [familiarsSnap, sessions, unseenReplies]);
  const rail = useStableValue(railState);
  const onOpenRail = useCallback((familiarId: string) => void onOpen(familiarId), [onOpen]);
  const onDeleteRail = useCallback(
    (familiarId: string) => void onDelete(familiarId),
    [onDelete],
  );

  // The memoized sidebar only skips a streamed batch if this keeps identity.
  return useMemo(
    () =>
      enabled
        ? {
            activeId,
            states: rail.states,
            unseenCounts: rail.unseen,
            onOpen: onOpenRail,
            onCreate,
            onDelete: onDeleteRail,
          }
        : undefined,
    [enabled, activeId, rail, onOpenRail, onCreate, onDeleteRail],
  );
}
