export function timestamp(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Timing unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(date);
}
