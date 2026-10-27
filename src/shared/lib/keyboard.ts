type ImeKeyboardEvent = Pick<KeyboardEvent, "isComposing" | "keyCode">;

export function isImeComposition(event: ImeKeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** The keyboard's way to open a context menu: the Menu key or Shift+F10. */
export function isContextMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}
