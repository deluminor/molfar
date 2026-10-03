import type { VaultNote } from "../model/vault/types";

export const NO_NOTES: VaultNote[] = [];
export const SIDE_PANEL_MIN_WIDTH = 280;
export const SIDE_PANEL_DEFAULT_WIDTH = 420;
export const SIDE_PANEL_MAX_RATIO = 0.7;

export const ICON_BUTTON =
  "grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent max-[480px]:size-11";

export const ACTION_FILLED =
  "inline-flex items-center gap-1.5 rounded-md bg-content px-3 text-[12px] font-medium text-background-base hover:bg-content/80 disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";
