import { type ComponentProps, useState } from "react";
import { HarnessUpdateNotice } from "@/features/providers/ui/HarnessUpdateNotice";
import type { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { ResourcePressureNotice } from "@/features/notifications/ui/ResourcePressureNotice";
import { ApprovalToasts } from "@/features/sessions/ui/ApprovalToasts";
import { ReminderNotices } from "@/features/sessions/ui/ReminderNotices";
import { NewLayoutNotice } from "../../../shell/NewLayoutNotice";
import { noticeStackOffset } from "./notice-stack";

type ToastProps = ComponentProps<typeof ApprovalToasts>;

type Props = {
  pressure: ComponentProps<typeof ResourcePressureNotice>;
  approvalNotices: ToastProps["notices"];
  onFocusApprovalSession: ToastProps["onFocusSession"];
  onApproval: ToastProps["onApproval"];
  reminders: ReturnType<typeof useSessionReminders>;
  onOpenReminderSettings: () => void;
};

/** The notices stacked down the window's top-right corner, reminders first. */
export function WorkspaceNotices({
  pressure,
  approvalNotices,
  onFocusApprovalSession,
  onApproval,
  reminders,
  onOpenReminderSettings,
}: Props) {
  const [reminderHeight, setReminderHeight] = useState(0);
  const [harnessUpdateHeight, setHarnessUpdateHeight] = useState(0);
  const [newLayoutHeight, setNewLayoutHeight] = useState(0);

  return (
    <>
      <HarnessUpdateNotice
        topOffset={noticeStackOffset([reminderHeight])}
        onHeightChange={setHarnessUpdateHeight}
      />
      <NewLayoutNotice
        topOffset={noticeStackOffset([reminderHeight, harnessUpdateHeight])}
        onHeightChange={setNewLayoutHeight}
      />
      <ResourcePressureNotice {...pressure} />
      <ApprovalToasts
        notices={approvalNotices}
        topOffset={noticeStackOffset([reminderHeight, harnessUpdateHeight, newLayoutHeight])}
        onFocusSession={onFocusApprovalSession}
        onApproval={onApproval}
      />
      <ReminderNotices
        reminders={reminders.due}
        error={reminders.error}
        onOpen={reminders.open}
        onSnooze={reminders.schedule}
        onDismiss={reminders.cancel}
        onRetry={reminders.refresh}
        onOpenSettings={onOpenReminderSettings}
        onHeightChange={setReminderHeight}
      />
    </>
  );
}
