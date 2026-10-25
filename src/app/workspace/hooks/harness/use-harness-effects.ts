import { useEffect, useLayoutEffect } from "react";
import type { Session } from "@/domain/session/session";
import { nativeSkillContextForSession } from "@/features/sessions/model/session-skills";
import { loadIdleAgentLimit } from "@/features/settings/model/settings";
import { warmNativeSkills } from "@/features/skills/model/skills";
import {
  configureHarnessIdlePark,
  isLiveHarness,
  refreshHarnessCatalogs,
} from "@/integrations/harness";
import type { createBtw } from "../../flows/btw/btw-actions";
import type { HarnessEventPipeline } from "../../flows/harness-events/harness-event-pipeline";

/** Aborts the side questions of chats that left the workspace. */
export function useBtwAbortClosed(
  btw: Pick<ReturnType<typeof createBtw>, "abortClosed">,
  sessions: readonly Session[],
): void {
  useEffect(() => {
    btw.abortClosed(new Set(sessions.map((session) => session.id)));
  }, [sessions, btw]);
}

/** Caps warm agent CLIs, sparing the conversations on screen. */
export function useHarnessIdlePark(
  harnessEvents: Pick<HarnessEventPipeline, "isForeground">,
): void {
  useEffect(() => {
    configureHarnessIdlePark({
      limit: loadIdleAgentLimit,
      keep: harnessEvents.isForeground,
    });
  }, [harnessEvents]);
}

/** Warms the native skills of the active chat's harness and folder. */
export function useWarmActiveSkills(active: Session | undefined): void {
  const activeSkillContext = active
    ? nativeSkillContextForSession(active)
    : null;
  const activeSkillCwd = activeSkillContext?.cwd;

  useEffect(() => {
    if (!activeSkillContext || !activeSkillCwd) return;
    warmNativeSkills(activeSkillContext);
  }, [activeSkillCwd, active?.id, active?.harness]);
}

/** Probe the active session's harness for its live model catalog whenever
 * the active harness changes. Catalogs load lazily (probing spawns a CLI
 * process) and the boot refresh runs before restored sessions land, so a
 * fresh session would otherwise show only the built-in fallback model
 * until the picker happened to be opened. Idempotent: refreshHarnessCatalogs
 * dedupes via hasLiveCatalog and its inflight map. */
export function useActiveHarnessCatalog(activeHarness: Session["harness"] | undefined): void {
  useEffect(() => {
    if (!activeHarness || !isLiveHarness(activeHarness)) return;
    void refreshHarnessCatalogs([activeHarness]);
  }, [activeHarness]);
}

type ShownSurface = {
  activeTabId: string;
  familiarViewId: string | null;
  inboxViewOpen: boolean;
  inboxAskSessionId: string | undefined;
  shownFamiliarSessionId: string | null | undefined;
  searchViewOpen: boolean;
  notesViewOpen: boolean;
  automationsViewOpen: boolean;
  settingsOpen: boolean;
};

/** Flushes the newly shown panes' stream output before paint whenever what is on screen changes. */
export function useForegroundFlush(
  flushForegroundHarnessEvents: () => void,
  {
    activeTabId,
    familiarViewId,
    inboxViewOpen,
    inboxAskSessionId,
    shownFamiliarSessionId,
    searchViewOpen,
    notesViewOpen,
    automationsViewOpen,
    settingsOpen,
  }: ShownSurface,
): void {
  useLayoutEffect(() => {
    // Catch up only the newly visible panes before paint. Other streams keep
    // their background timer instead of adding work to this tab switch.
    flushForegroundHarnessEvents();
  }, [
    activeTabId,
    familiarViewId,
    inboxViewOpen,
    inboxAskSessionId,
    shownFamiliarSessionId,
    searchViewOpen,
    notesViewOpen,
    automationsViewOpen,
    settingsOpen,
    flushForegroundHarnessEvents,
  ]);
}
