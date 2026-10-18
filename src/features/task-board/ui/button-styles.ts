const BASE =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[12px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none";

export const PRIMARY_BUTTON = `${BASE} bg-accent/90 text-white enabled:hover:bg-accent`;
export const QUIET_BUTTON = `${BASE} text-content/70 enabled:hover:bg-content/[0.08] enabled:hover:text-content`;
export const OUTLINE_BUTTON = `${BASE} border border-stroke text-content/80 enabled:hover:bg-content/[0.06]`;
export const DANGER_BUTTON = `${BASE} bg-rose-500/15 text-rose-300 enabled:hover:bg-rose-500/25`;

export const FIELD =
  "w-full rounded-md border border-stroke bg-content/[0.03] px-2.5 py-1.5 text-[13px] text-content outline-none placeholder:text-content/30 focus:border-accent/60";
export const FIELD_LABEL = "flex flex-col gap-1 text-[12px] text-content/60";
