import type { ReactNode } from "react";

type Props = {
  title: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** Framed dashboard tile with the dashed accent caption used across Home. */
export function HomeCard({
  title,
  className = "",
  actions,
  children,
}: Props): ReactNode {
  return (
    <section
      aria-label={title}
      className={`home-card flex min-h-0 min-w-0 flex-col rounded-lg border border-stroke bg-content/[0.025] p-3 ${className}`}
    >
      <header className="home-card-drag-handle mb-2 flex h-5 shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70">
        <span
          aria-hidden
          className="w-4 border-t border-dashed border-accent/40"
        />
        <h2 className="shrink-0 font-medium">{title}</h2>
        <span
          aria-hidden
          className="flex-1 border-t border-dashed border-accent/20"
        />
        {actions}
      </header>
      <div className="home-card-body relative min-h-0 flex-1">{children}</div>
    </section>
  );
}
