import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { Session } from "@/domain/session/session";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import { setWindowFocused } from "@/features/notifications/model/notifications";

type Flag = { readonly current: boolean };

type WindowFocusInput = {
  flushForegroundHarnessEvents: () => void;
  sessionsRef: { readonly current: Session[] };
  projectTerminalFocusedRef: Flag;
  searchViewOpenRef: Flag;
  inboxViewOpenRef: Flag;
  notesViewOpenRef: Flag;
  automationsViewOpenRef: Flag;
  settingsOpenRef: Flag;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setComposerFocusToken: Dispatch<SetStateAction<number>>;
};

/** On focus: flushes visible output, syncs the dock badge and gives the composer focus back unless a view or the terminal holds it. */
export function useWindowFocus({
  flushForegroundHarnessEvents,
  sessionsRef,
  projectTerminalFocusedRef,
  searchViewOpenRef,
  inboxViewOpenRef,
  notesViewOpenRef,
  automationsViewOpenRef,
  settingsOpenRef,
  setComposerFocused,
  setComposerFocusToken,
}: WindowFocusInput): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setWindowFocused(focused);
        if (focused) {
          flushForegroundHarnessEvents();
          syncDockBadge(sessionsRef.current);
          if (
            document.activeElement === document.body &&
            !projectTerminalFocusedRef.current &&
            !searchViewOpenRef.current &&
            !inboxViewOpenRef.current &&
            !notesViewOpenRef.current &&
            !automationsViewOpenRef.current &&
            !settingsOpenRef.current
          ) {
            setComposerFocused(true);
            setComposerFocusToken((token) => token + 1);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [
    flushForegroundHarnessEvents,
    sessionsRef,
    projectTerminalFocusedRef,
    searchViewOpenRef,
    inboxViewOpenRef,
    notesViewOpenRef,
    automationsViewOpenRef,
    settingsOpenRef,
    setComposerFocused,
    setComposerFocusToken,
  ]);
}
