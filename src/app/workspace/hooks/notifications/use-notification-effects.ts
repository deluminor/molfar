import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import {
  loadNotificationsEnabled,
  probeNotificationPermission,
} from "@/features/notifications/model/notifications";

/** Cache the OS decision so a turn ending later can skip a denied banner. */
export function useNotificationPermissionProbe(): void {
  useEffect(() => {
    if (loadNotificationsEnabled()) void probeNotificationPermission();
  }, []);
}

/** The dock badge follows the chats waiting on the user. */
export function useDockBadge(sessions: Session[]): void {
  useEffect(() => {
    syncDockBadge(sessions);
  }, [sessions]);
}
