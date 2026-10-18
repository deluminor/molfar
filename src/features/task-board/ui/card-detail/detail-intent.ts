import type { BoardActionType } from "../../model/transitions";

/** A gate action the drawer should open straight into, e.g. after a drop. */
export type DetailIntent = "requestChanges" | "rework" | "deliver" | null;

export function detailIntent(action: BoardActionType): DetailIntent {
  if (action === "requestChanges" || action === "rework" || action === "deliver") return action;
  return null;
}
