import type { ReactNode } from "react";
import { OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { IS_MAC } from "../../../platform/tauri/platform";
import type { IconComponent } from "../../../shared/ui/icons";

type Props = {
  title: string;
  icon: IconComponent;
  besideRail: boolean;
  compactRail: boolean;
  onClose: () => void;
  onToggleSidebar?: () => void;
  actions?: ReactNode;
};

/** Title bar shared by the Home and Usage surfaces; mirrors the Automations header. */
export function SurfaceHeader({
  title,
  icon: Icon,
  besideRail,
  compactRail,
  onClose,
  onToggleSidebar,
  actions,
}: Props): ReactNode {
  return (
    <div
      className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
      data-tauri-drag-region="deep"
    >
      {IS_MAC && compactRail ? <div className="w-4 shrink-0" /> : null}
      {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
      {besideRail ? null : (
        <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
        <Icon
          className="size-3.5 shrink-0 text-content/45"
          strokeWidth={1.75}
        />
        <span className="min-w-0 truncate text-content">{title}</span>
      </div>
      {actions}
      {IS_MAC ? null : <WindowControls />}
    </div>
  );
}
