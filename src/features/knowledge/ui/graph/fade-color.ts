export function fadeColor(color: string, alpha: number): string {
  const channels = color.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/,
  );
  if (!channels) return color;

  return `rgba(${channels[1]}, ${channels[2]}, ${channels[3]}, ${alpha})`;
}
