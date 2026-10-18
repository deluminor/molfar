import { useCallback, type MouseEvent, type ReactNode } from "react";
import { HOME_WIDGET_IDS, type HomeWidgetId } from "../model/home-layout";
import { HOME_WIDGET_LABELS } from "../model/home-widget-registry";

type Props = {
  hidden: readonly HomeWidgetId[];
  onShowWidget: (id: HomeWidgetId) => void;
};

function isWidgetId(value: string | undefined): value is HomeWidgetId {
  return HOME_WIDGET_IDS.some((id) => id === value);
}

/** Edit-only restore chips for widgets the user hid. */
export function HiddenWidgetsStrip({ hidden, onShowWidget }: Props): ReactNode {
  const onShow = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.id;
      if (isWidgetId(id)) onShowWidget(id);
    },
    [onShowWidget],
  );

  if (hidden.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Hidden widgets"
      className="mb-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
    >
      <span className="mr-1 text-content/40">Hidden</span>
      {hidden.map((id) => (
        <button
          key={id}
          type="button"
          data-id={id}
          onClick={onShow}
          aria-label={`Show ${HOME_WIDGET_LABELS[id]}`}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-accent/30 px-2 py-1 text-content/60 transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline-1 focus-visible:outline-accent"
        >
          {HOME_WIDGET_LABELS[id]}
          <span className="text-accent/70">Show</span>
        </button>
      ))}
    </div>
  );
}
