export type ClockParts = {
  time: string;
  period: string | null;
  date: string;
};

/**
 * Split a moment into the large time, the optional AM/PM suffix, and the date line.
 * @param now - Moment to format.
 * @param locale - BCP 47 locale; defaults to the runtime locale.
 */
export function clockParts(now: Date, locale?: string): ClockParts {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const time = parts
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  const period = parts.find((part) => part.type === "dayPeriod")?.value ?? null;
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  return { time, period, date };
}

export function msUntilNextSecond(now: number): number {
  return 1000 - (now % 1000);
}
