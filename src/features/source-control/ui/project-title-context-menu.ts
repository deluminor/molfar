import type { KeyboardEvent, MouseEvent } from "react";
import { isContextMenuKey } from "@/shared/lib/keyboard";

type OpenMenu = (x: number, y: number, trigger: HTMLElement) => void;

/** Right-click and Menu-key handlers that open a project's menu from its title, closing the picker first. */
export function projectTitleContextMenu(
  open: OpenMenu | undefined,
  closePicker: () => void,
) {
  if (!open) return { onContextMenu: undefined, openFromKey: () => false };

  return {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      closePicker();
      open(event.clientX, event.clientY, event.currentTarget);
    },
    openFromKey: (event: KeyboardEvent<HTMLElement>): boolean => {
      if (!isContextMenuKey(event)) return false;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      closePicker();
      open(rect.left, rect.bottom, event.currentTarget);
      return true;
    },
  };
}
