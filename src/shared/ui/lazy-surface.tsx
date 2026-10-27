import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/** Keep optional surfaces out of the composer's startup dependency graph. */
export function lazySurface<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  { suspense = true }: { suspense?: boolean } = {},
) {
  let pending: ReturnType<typeof load> | undefined;
  let loaded: ComponentType<Props> | undefined;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const snapshot = () => loaded;
  const preload = () => {
    pending ??= load()
      .then((module) => {
        loaded = module.default;
        for (const listener of [...listeners]) listener();
        return module;
      })
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
  let Surface = lazy(preload);
  // React.lazy caches a rejection forever; a fresh wrapper lets "Try again" re-import.
  const retry = () => {
    Surface = lazy(preload);
  };
  function ReadySurface(props: Props) {
    // Import completion must commit even when streaming updates keep React's
    // lower-priority Suspense retry work busy. The store publishes readiness
    // synchronously; the loaded component keeps its identity on later renders.
    const Component = useSyncExternalStore(subscribe, snapshot, snapshot);
    const [error, setError] = useState<{ value: unknown } | null>(null);
    useEffect(() => {
      if (Component) return;
      let active = true;
      void preload().catch((caught: unknown) => {
        if (active) setError({ value: caught });
      });
      return () => {
        active = false;
      };
    }, [Component]);
    if (error) throw error.value;
    return (
      <Suspense fallback={null}>
        {Component ? <Component {...props} /> : null}
      </Suspense>
    );
  }
  function LazySurface(props: Props) {
    const [, rerender] = useReducer((attempt: number) => attempt + 1, 0);
    const onRetry = useCallback(() => {
      retry();
      rerender();
    }, []);

    // Navigation uses the app's existing boundary so a transition keeps the
    // current screen visible until the destination has loaded.
    return (
      <ErrorBoundary scope="surface" recovery="retry" onRetry={onRetry}>
        {suspense ? <ReadySurface {...props} /> : <Surface {...props} />}
      </ErrorBoundary>
    );
  }
  return Object.assign(LazySurface, { preload });
}
