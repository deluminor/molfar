import type { HomeWidgetId } from "./homeLayout";

/** Display names for edit chrome (Hide titles, Hidden widgets chips). */
export const HOME_WIDGET_LABELS: Record<HomeWidgetId, string> = {
  clock: "Clock",
  status: "Status",
  brand: "Brand",
  host: "Host",
  usage: "Usage",
  inbox: "Inbox",
  git: "Activity",
  sessions: "Sessions",
  automations: "Automations",
  matrix: "Matrix",
};

export const LAST_WIDGET_HIDE_REASON = "At least one widget must stay visible";
