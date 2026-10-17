import type { ReactNode } from "react";

type Props = {
  /** Number of anonymous placeholder tiles. */
  count?: number;
  /** Dense layout for the Home Usage strip. */
  compact?: boolean;
};

function SkeletonTile({ compact }: { compact: boolean }): ReactNode {
  if (compact) {
    return (
      <div
        aria-hidden
        className="flex min-h-0 min-w-0 flex-col justify-center gap-1.5 rounded-md px-2.5 py-2"
      >
        <div className="h-2.5 w-14 rounded bg-content/10 motion-safe:animate-pulse" />
        <div className="h-1 w-full rounded-full bg-content/[0.07] motion-safe:animate-pulse" />
        <div className="h-2 w-20 rounded bg-content/[0.07] motion-safe:animate-pulse" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="flex min-h-0 flex-col gap-3 rounded-lg border border-stroke bg-content/[0.025] p-3"
    >
      <div className="h-2.5 w-16 rounded bg-content/10 motion-safe:animate-pulse" />
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-content/[0.07] motion-safe:animate-pulse" />
        <div className="h-1 w-full rounded-full bg-content/[0.07] motion-safe:animate-pulse" />
        <div className="h-3 w-20 rounded bg-content/[0.07] motion-safe:animate-pulse" />
        <div className="h-1 w-full rounded-full bg-content/[0.07] motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Neutral Usage loading surface — glass tiles with shimmer, no provider names.
 */
export function UsageProvidersSkeleton({
  count = 3,
  compact = false,
}: Props): ReactNode {
  const tiles = Array.from({ length: count }, (_, index) => (
    <SkeletonTile key={index} compact={compact} />
  ));

  if (compact) {
    return (
      <div
        role="status"
        aria-label="Loading usage"
        className="grid h-full min-h-0 grid-cols-2 auto-rows-fr content-stretch gap-1"
      >
        {tiles}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading usage"
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      {tiles}
    </div>
  );
}
