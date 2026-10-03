export function linkDestination(raw: string): string {
  const value = raw.trim();
  const angled = value.match(/^<([^>\n]*)>/);
  if (angled) return angled[1];

  return value.split(/\s/, 1)[0] ?? "";
}
