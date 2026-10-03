type EscapeTarget = { readonly current: () => void };

const stack: EscapeTarget[] = [];
let installed = false;

function onKeyDown(event: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (!top || event.key !== "Escape" || event.defaultPrevented) return;
  if (
    event.target instanceof Element &&
    event.target.closest("[data-dialog-popover]")
  )
    return;

  event.preventDefault();
  event.stopImmediatePropagation();
  top.current();
}

/**
 * Window capture listeners run in registration order, so views mounted before
 * a modal (Inbox, Search, …) would otherwise eat Escape first. Call at boot,
 * before any view registers its own Escape handler.
 */
export function installModalEscape(): void {
  if (installed) return;

  installed = true;
  window.addEventListener("keydown", onKeyDown, true);
}

/** Only the most recently opened modal receives Escape. */
export function pushModalEscape(target: EscapeTarget): () => void {
  installModalEscape();
  stack.push(target);

  return () => {
    const index = stack.lastIndexOf(target);
    if (index !== -1) stack.splice(index, 1);
  };
}
