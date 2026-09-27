import { useEffect, useState, type ReactNode } from "react";
import { clockParts, msUntilNextSecond } from "../model/clock";
import { HomeCard } from "./HomeCard";

export function ClockCard(): ReactNode {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, msUntilNextSecond(Date.now()));
    };
    timer = setTimeout(tick, msUntilNextSecond(Date.now()));
    return () => clearTimeout(timer);
  }, []);

  const { time, period, date } = clockParts(now);
  return (
    <HomeCard title="Clock">
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <time
          dateTime={now.toISOString()}
          className="flex items-start font-mono text-5xl font-semibold leading-none tracking-tight text-accent tabular-nums"
        >
          {time}
          {period ? (
            <span className="ml-1 mt-1 text-sm font-medium text-accent/70">{period}</span>
          ) : null}
        </time>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-content/40">
          {date}
        </span>
      </div>
    </HomeCard>
  );
}
