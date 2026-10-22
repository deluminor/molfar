import type { AutomationScheduleKind } from "../automations/schedule";

export type HabitSchedule = {
  scheduleKind: AutomationScheduleKind;
  /** Minute past the hour, for hourly habits. */
  minute: number;
  /** "HH:MM", local time. */
  time: string;
  /** 0 is Sunday, for weekly habits. */
  dayOfWeek: number;
};
