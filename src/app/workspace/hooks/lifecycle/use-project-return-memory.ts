import { useCallback, useEffect, useRef } from "react";
import type { Session } from "@/domain/session/session";
import {
  reconcileProjectReturn,
  type ProjectReturnMemory,
} from "@/features/projects/model/project-return";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

type ProjectReturnMemoryInput = {
  initial: ProjectReturnMemory | undefined;
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  tabsRef: { readonly current: WorkspaceTab[] };
  sessionsRef: { readonly current: Session[] };
  activeTabIdRef: { readonly current: string };
};

export type ProjectReturn = {
  ref: { readonly current: ProjectReturnMemory };
  read: () => ProjectReturnMemory;
};

/** Which tab each project returns to, reconciled after every tab or chat change and on each read. */
export function useProjectReturnMemory({
  initial,
  tabs,
  sessions,
  activeTabId,
  tabsRef,
  sessionsRef,
  activeTabIdRef,
}: ProjectReturnMemoryInput): ProjectReturn {
  const ref = useRef<ProjectReturnMemory>(initial ?? new Map());
  const read = useCallback(() => {
    ref.current = reconcileProjectReturn({
      memory: ref.current,
      tabs: tabsRef.current,
      sessions: sessionsRef.current,
      activeTabId: activeTabIdRef.current,
    });
    return ref.current;
  }, [tabsRef, sessionsRef, activeTabIdRef]);

  useEffect(() => {
    read();
  }, [activeTabId, tabs, sessions, read]);

  return { ref, read };
}
