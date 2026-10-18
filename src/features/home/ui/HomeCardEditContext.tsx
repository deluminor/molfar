import { createContext, useContext, type ReactNode } from "react";
import { LAST_WIDGET_HIDE_REASON } from "../model/home-widget-registry";

export type HomeCardEdit = {
  label: string;
  canHide: boolean;
  onHide: () => void;
};

/** Set by HomeGrid only while editing, so cards stay unaware of edit mode. */
export const HomeCardEditContext = createContext<HomeCardEdit | null>(null);

export function HomeCardHideControl(): ReactNode {
  const edit = useContext(HomeCardEditContext);
  if (!edit) return null;

  return (
    <button
      type="button"
      disabled={!edit.canHide}
      onClick={edit.onHide}
      aria-label={`Hide ${edit.label}`}
      title={edit.canHide ? `Hide ${edit.label}` : LAST_WIDGET_HIDE_REASON}
      className="home-card-edit-control shrink-0 rounded border border-content/10 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-content/40 opacity-60 transition hover:border-accent/40 hover:text-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-content/10 disabled:hover:text-content/40"
    >
      Hide
    </button>
  );
}
