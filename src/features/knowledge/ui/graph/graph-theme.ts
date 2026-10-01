import { MUTED_ALPHA } from "./constants";
import { fadeColor } from "./fade-color";

export function graphTheme(element: HTMLElement): {
  background: string;
  content: string;
  accent: string;
  muted: string;
} {
  const probe = document.createElement("span");
  probe.hidden = true;
  element.append(probe);
  const read = (token: string): string => {
    probe.style.color = `var(${token})`;

    return getComputedStyle(probe).color;
  };
  const content = read("--color-content");
  const theme = {
    background: read("--color-background-base"),
    content,
    accent: read("--color-accent"),
    muted: fadeColor(content, MUTED_ALPHA),
  };
  probe.remove();

  return theme;
}
