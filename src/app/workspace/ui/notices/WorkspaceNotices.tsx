import { type ComponentProps, useState } from "react";
import { HarnessUpdateNotice } from "@/features/providers/ui/HarnessUpdateNotice";
import type { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { ResourcePressureNotice } from "@/features/notifications/ui/ResourcePressureNotice";
import { ApprovalToasts } from "@/features/sessions/ui/ApprovalToasts";
import { ReminderNotices } from "@/features/sessions/ui/ReminderNotices";
import { NewLayoutNotice } from "../../../shell/NewLayoutNotice";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { noticeStackOffset } from "./notice-stack";

type ToastProps = ComponentProps<typeof ApprovalToasts>;

type Props = {
  pressure: Omit<ComponentProps<typeof ResourcePressureNotice>, "onStopAgent" | "onStopSession">;
  approvalNotices: ToastProps["notices"];
  reminders: ReturnType<typeof useSessionReminders>;
};

/** The notices stacked down the window's top-right corner, reminders first. */
export function WorkspaceNotices({ pressure, approvalNotices, reminders }: Props) {
  const { turns, workerPanes, surfaces } = useWorkspaceHandlers();
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
      <ResourcePressureNotice
        {...pressure}
        onStopAgent={(id) => turns.stop(id, true)}
        onStopSession={turns.stop}
      />
      <ApprovalToasts
        notices={approvalNotices}
        topOffset={noticeStackOffset([reminderHeight, harnessUpdateHeight, newLayoutHeight])}
        onFocusSession={workerPanes.openSession}
        onApproval={turns.approve}
      />
      <ReminderNotices
        reminders={reminders.due}
        error={reminders.error}
        onOpen={reminders.open}
        onSnooze={reminders.schedule}
        onDismiss={reminders.cancel}
        onRetry={reminders.refresh}
        onOpenSettings={surfaces.openReminderSettings}
        onHeightChange={setReminderHeight}
      />
    </>
  );
}
