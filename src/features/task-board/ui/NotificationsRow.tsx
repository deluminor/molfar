import { useEffect, useState, type ReactNode } from "react";
import {
  cachedNotificationPermission,
  loadNotificationsEnabled,
  openNotificationSettings,
  probeNotificationPermission,
  requestNotificationPermission,
  saveNotificationsEnabled,
  type NotificationPermission,
} from "../../notifications/model/notifications";
import { Toggle } from "../../settings/ui/Toggle";

function hint(enabled: boolean, permission: NotificationPermission): string {
  if (!enabled) return "Off: gates, failures and stalls only show on the board.";
  if (permission === "denied") return "macOS blocks MOLFAR's notifications.";
  return "A banner when a card waits on you, fails or runs long. Shared with Settings → Notifications.";
}

/** The app-wide notification switch, where the board needs it. */
export function NotificationsRow(): ReactNode {
  const [enabled, setEnabled] = useState(loadNotificationsEnabled);
  const [permission, setPermission] = useState(cachedNotificationPermission);

  useEffect(() => {
    let alive = true;
    void probeNotificationPermission().then((next) => alive && setPermission(next));
    return () => {
      alive = false;
    };
  }, []);

  const change = (next: boolean) => {
    saveNotificationsEnabled(next);
    setEnabled(next);
    if (next) void requestNotificationPermission().then(setPermission);
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-stroke bg-content/[0.03] p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] text-content/85">Desktop notifications</span>
        <span className="text-[11.5px] leading-4 text-content/45">{hint(enabled, permission)}</span>
        {enabled && permission === "denied" ? (
          <button
            type="button"
            onClick={() => void openNotificationSettings()}
            className="mt-1 self-start cursor-pointer text-[11.5px] text-accent hover:underline"
          >
            Open system settings
          </button>
        ) : null}
      </div>
      <Toggle label="Desktop notifications" on={enabled} onChange={change} />
    </div>
  );
}
