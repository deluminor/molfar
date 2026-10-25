// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeGraph } from "./use-knowledge-graph";
import type { KnowledgeGraphProjection } from "../../model/graph/types";

const fixture = vi.hoisted(() => {
  let data: {
    nodes: { id: string; x?: number; y?: number; z?: number }[];
    links: object[];
  } = { nodes: [], links: [] };
  const instance: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "width",
    "height",
    "backgroundColor",
    "showNavInfo",
    "nodeRelSize",
    "nodeResolution",
    "nodeOpacity",
    "linkOpacity",
    "linkDirectionalArrowLength",
    "linkDirectionalArrowRelPos",
    "cooldownTicks",
    "cooldownTime",
    "warmupTicks",
    "onNodeClick",
    "nodeLabel",
    "nodeVal",
    "nodeColor",
    "linkColor",
    "linkWidth",
    "cameraPosition",
    "zoomToFit",
    "pauseAnimation",
    "resumeAnimation",
    "_destructor",
  ]) {
    instance[method] = vi.fn(() => instance);
  }
  instance.graphData = vi.fn((next?: typeof data) => {
    if (!next) return data;
    data = next;
    return instance;
  });
  const construct = vi.fn(function () {
    return instance;
  });

  return { instance, construct };
});

vi.mock("3d-force-graph", () => ({ default: fixture.construct }));
vi.mock("./graph-theme", () => ({
  graphTheme: () => ({
    background: "bg",
    content: "content",
    accent: "accent",
    muted: "muted",
  }),
}));
vi.mock("@/features/settings/hooks/use-color-scheme", () => ({
  useColorScheme: () => "dark",
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let disconnect: ReturnType<typeof vi.fn>;
const projection: KnowledgeGraphProjection = {
  nodes: [
    {
      id: "A.md",
      title: "<img src=x onerror=alert(1)>",
      folder: "",
      degree: 1,
    },
  ],
  links: [],
  total: 1,
  missing: 0,
  ambiguous: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  const media = new EventTarget();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("cleans up graphics and uses text labels without interpreting note HTML", async () => {
  const onSelect = vi.fn();
  function Probe() {
    const scene = useKnowledgeGraph(projection, null, onSelect);
    return createElement("div", { ref: scene.host });
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  expect(fixture.instance.cooldownTicks).toHaveBeenCalledWith(0);
  const label = fixture.instance.nodeLabel.mock.calls[0][0]({ id: "A.md" });
  expect(label.textContent).toContain("<img");
  expect(label.querySelector("img")).toBeNull();
  fixture.instance.onNodeClick.mock.calls[0][0]({ id: "A.md" });
  expect(onSelect).toHaveBeenCalledWith("A.md");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(fixture.instance.pauseAnimation).toHaveBeenCalled();
  act(() => root.unmount());
  expect(fixture.instance._destructor).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
  delete document.hidden;
  root = createRoot(container);
});

it("surfaces graphics startup failure without breaking file navigation", async () => {
  fixture.construct.mockImplementationOnce(() => {
    throw new Error("WebGL unavailable");
  });
  function Probe() {
    const scene = useKnowledgeGraph(projection, null, vi.fn());
    return createElement("div", { ref: scene.host }, scene.error);
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  expect(container.textContent).toContain("WebGL unavailable");
  expect(container.textContent).toContain("file tree");
});

it("highlights the selection and its direct connections without moving the camera", async () => {
  const linked: KnowledgeGraphProjection = {
    ...projection,
    nodes: ["A.md", "B.md", "C.md"].map((id) => ({
      id,
      title: id,
      folder: "",
      degree: 1,
    })),
    links: [{ source: "A.md", target: "B.md" }],
    total: 3,
  };
  function Probe() {
    const scene = useKnowledgeGraph(linked, "A.md", vi.fn());
    return createElement("div", { ref: scene.host });
  }
  await act(async () => {
    root.render(createElement(Probe));
  });

  const nodeColor = fixture.instance.nodeColor.mock.lastCall?.[0];
  const linkColor = fixture.instance.linkColor.mock.lastCall?.[0];
  expect(nodeColor({ id: "A.md" })).toBe("accent");
  expect(nodeColor({ id: "B.md" })).toBe("content");
  expect(nodeColor({ id: "C.md" })).toBe("muted");
  expect(linkColor({ source: { id: "A.md" }, target: { id: "B.md" } })).toBe(
    "content",
  );
  expect(linkColor({ source: "B.md", target: "C.md" })).toBe("muted");
  expect(fixture.instance.cameraPosition).toHaveBeenCalledOnce();
});

it("opens with a distant camera on the first data and never re-frames on refresh", async () => {
  let current = projection;
  function Probe() {
    const scene = useKnowledgeGraph(current, null, vi.fn());
    return createElement("div", { ref: scene.host });
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  current = { ...projection, nodes: [...projection.nodes] };
  await act(async () => {
    root.render(createElement(Probe));
  });

  expect(fixture.instance.cameraPosition).toHaveBeenCalledOnce();
  expect(fixture.instance.cameraPosition).toHaveBeenCalledWith(
    { x: 0, y: 0, z: 380 },
    { x: 0, y: 0, z: 0 },
    0,
  );
  expect(fixture.instance.zoomToFit).not.toHaveBeenCalled();
});
