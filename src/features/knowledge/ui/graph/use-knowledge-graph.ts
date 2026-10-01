import { useEffect, useRef, useState } from "react";
import type {
  ForceGraph3DInstance,
  LinkObject,
  NodeObject,
} from "3d-force-graph";
import { useColorScheme } from "../../../../shared/hooks/useColorScheme";
import type { KnowledgeGraphProjection } from "../../model/graph/types";
import { graphFocus } from "../../model/graph/graph-focus";
import { CAMERA_DISTANCE_PER_NODE } from "./constants";
import { graphTheme } from "./graph-theme";

export function useKnowledgeGraph(
  projection: KnowledgeGraphProjection,
  selectedPath: string | null,
  onSelect: (path: string) => void,
) {
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraph3DInstance | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheme = useColorScheme();
  const reducedMotion = useRef(false);
  const framed = useRef(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let instance: ForceGraph3DInstance | null = null;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = motion.matches;
    const visibility = (): void => {
      if (document.hidden) instance?.pauseAnimation();
      else instance?.resumeAnimation();
    };
    const changeMotion = (): void => {
      reducedMotion.current = motion.matches;
      instance?.cooldownTicks(motion.matches ? 0 : 100);
    };
    const contextLost = (event: Event): void => {
      event.preventDefault();
      instance?.pauseAnimation();
      setError(
        "The 3D graphics context was lost. You can still navigate with the file tree. Reopen Knowledge to retry.",
      );
    };

    void import("3d-force-graph")
      .then(({ default: ForceGraph3D }) => {
        if (disposed) return;
        instance = new ForceGraph3D(element, {
          controlType: "orbit",
          rendererConfig: { antialias: true, alpha: true },
        });
        graph.current = instance;
        instance
          .showNavInfo(false)
          .nodeRelSize(3)
          .nodeResolution(10)
          .nodeOpacity(0.92)
          .linkOpacity(0.22)
          .linkDirectionalArrowLength(2)
          .linkDirectionalArrowRelPos(1)
          .cooldownTicks(motion.matches ? 0 : 100)
          .cooldownTime(6_000)
          .warmupTicks(motion.matches ? 40 : 0)
          .onNodeClick((node) => {
            if (typeof node.id === "string") onSelectRef.current(node.id);
          });
        const resize = (): void => {
          if (element.clientWidth && element.clientHeight)
            instance?.width(element.clientWidth).height(element.clientHeight);
        };
        observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        element.addEventListener("webglcontextlost", contextLost, true);
        document.addEventListener("visibilitychange", visibility);
        motion.addEventListener("change", changeMotion);
        visibility();
        setReady(true);
      })
      .catch((failure: unknown) => {
        if (!disposed)
          setError(
            `Could not start the 3D graph: ${String(failure)}. Use the file tree to continue.`,
          );
      });

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", changeMotion);
      element.removeEventListener("webglcontextlost", contextLost, true);
      instance?._destructor();
      graph.current = null;
      element.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const instance = graph.current;
    if (!ready || !instance) return;
    const previous = new Map(
      instance.graphData().nodes.map((node) => [node.id, node]),
    );
    const nodes = projection.nodes.map((node) => {
      const old = previous.get(node.id);

      return { ...node, x: old?.x, y: old?.y, z: old?.z };
    });
    instance.graphData({
      nodes,
      links: projection.links.map((link) => ({ ...link })),
    });

    // The library's default camera distance frames the unsettled layout, which then outgrows the view.
    if (!framed.current && nodes.length) {
      framed.current = true;
      instance.cameraPosition(
        { x: 0, y: 0, z: Math.cbrt(nodes.length) * CAMERA_DISTANCE_PER_NODE },
        { x: 0, y: 0, z: 0 },
        0,
      );
    }

    const labels = new Map(projection.nodes.map((node) => [node.id, node]));
    instance
      .nodeLabel((node) => {
        const label = document.createElement("span");
        const source =
          typeof node.id === "string" ? labels.get(node.id) : undefined;
        label.textContent = source ? `${source.title} · ${source.id}` : "Note";

        return label;
      })
      .nodeVal((node) => {
        const source =
          typeof node.id === "string" ? labels.get(node.id) : undefined;

        return 1 + Math.min(source?.degree ?? 0, 30) * 0.3;
      });
  }, [projection, ready]);

  useEffect(() => {
    const instance = graph.current;
    const element = host.current;
    if (!ready || !instance || !element) return;

    const theme = graphTheme(element);
    const focus = graphFocus(projection.links, selectedPath);
    const endId = (end: string | number | NodeObject | undefined) =>
      typeof end === "object" ? end.id : end;
    const touchesSelection = (link: LinkObject): boolean =>
      endId(link.source) === selectedPath ||
      endId(link.target) === selectedPath;

    instance
      .backgroundColor(theme.background)
      .nodeColor((node) => {
        if (node.id === selectedPath) return theme.accent;
        if (!focus || (typeof node.id === "string" && focus.has(node.id)))
          return theme.content;

        return theme.muted;
      })
      .linkColor((link) => {
        if (!focus || touchesSelection(link)) return theme.content;

        return theme.muted;
      })
      .linkWidth((link) => (touchesSelection(link) ? 1.2 : 0.4));
  }, [selectedPath, scheme, ready, projection]);

  const fit = (): void => {
    graph.current?.zoomToFit(reducedMotion.current ? 0 : 400, 50);
  };

  return { host, ready, error, fit };
}
