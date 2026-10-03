import { describe, expect, it } from "vitest";
import type { VaultNote } from "../vault/types";
import { MAX_GRAPH_NODES } from "./constants";
import { projectKnowledgeGraph } from "./project-graph";
import {
  normalizeVaultPath,
  noteIndex,
  resolveVaultLink,
} from "./resolve-links";

function note(
  path: string,
  targets: string[] = [],
  aliases: string[] = [],
): VaultNote {
  return {
    path,
    title: path,
    aliases,
    tags: [],
    links: targets.map((target) => ({ target, kind: "wiki" })),
  };
}

describe("vault link resolution", () => {
  const index = noteIndex([
    note("Projects/Start.md"),
    note("Projects/Design.md", [], ["Blueprint"]),
    note("Archive/Design.md"),
    note("Привіт.md"),
  ]);

  it("resolves paths, aliases, Unicode, headings and relative Markdown targets", () => {
    expect(
      resolveVaultLink(index, "Projects/Start.md", {
        target: "Design#Heading",
        kind: "wiki",
      }),
    ).toEqual({ state: "resolved", path: "Projects/Design.md" });
    expect(
      resolveVaultLink(index, "Projects/Start.md", {
        target: "Blueprint",
        kind: "wiki",
      }),
    ).toEqual({ state: "resolved", path: "Projects/Design.md" });
    expect(
      resolveVaultLink(index, "Projects/Start.md", {
        target: "../Привіт.md#^block",
        kind: "markdown",
      }),
    ).toEqual({ state: "resolved", path: "Привіт.md" });
    expect(
      resolveVaultLink(index, "Projects/Start.md", {
        target: "#local",
        kind: "markdown",
      }),
    ).toEqual({ state: "resolved", path: "Projects/Start.md" });
  });

  it("distinguishes missing and ambiguous references from attachments", () => {
    expect(
      resolveVaultLink(index, "Root.md", { target: "Design", kind: "wiki" })
        .state,
    ).toBe("ambiguous");
    expect(
      resolveVaultLink(index, "Root.md", { target: "%ZZ", kind: "wiki" }).state,
    ).toBe("missing");
    expect(
      resolveVaultLink(index, "Root.md", { target: "Absent", kind: "wiki" })
        .state,
    ).toBe("missing");
    expect(
      resolveVaultLink(index, "Root.md", { target: "photo.png", kind: "wiki" })
        .state,
    ).toBe("attachment");
  });

  it("resolves dotted note names and aliases before treating them as attachments", () => {
    const dotted = noteIndex([
      note("Archive/2026.10.01.md"),
      note("Release.md", [], ["v1.2"]),
    ]);

    expect(
      resolveVaultLink(dotted, "Root.md", {
        target: "2026.10.01",
        kind: "wiki",
      }),
    ).toEqual({ state: "resolved", path: "Archive/2026.10.01.md" });
    expect(
      resolveVaultLink(dotted, "Root.md", { target: "v1.2", kind: "wiki" }),
    ).toEqual({ state: "resolved", path: "Release.md" });
    expect(
      resolveVaultLink(dotted, "Root.md", { target: "v1.3", kind: "wiki" })
        .state,
    ).toBe("attachment");
  });

  it("rejects absolute and escaping paths", () => {
    expect(normalizeVaultPath("../../secret.md")).toBeNull();
    expect(normalizeVaultPath("/secret.md")).toBeNull();
    expect(normalizeVaultPath("C:/secret.md")).toBeNull();
    expect(normalizeVaultPath("a/../b.md")).toBe("b.md");
  });
});

describe("knowledge graph projection", () => {
  it("deduplicates links and preserves selected neighbors in a bounded graph", () => {
    const notes = Array.from({ length: 5_000 }, (_, i) => note(`note-${i}.md`));
    notes[4_999].links = [
      { target: "note-4998", kind: "wiki" },
      { target: "note-4998", kind: "wiki" },
    ];
    const result = projectKnowledgeGraph(notes, "note-4999.md", "");
    expect(result.nodes).toHaveLength(MAX_GRAPH_NODES);
    expect(result.nodes[0].id).toBe("note-4999.md");
    expect(result.nodes[1].id).toBe("note-4998.md");
    expect(result.links).toEqual([
      { source: "note-4999.md", target: "note-4998.md" },
    ]);
    expect(result.total).toBe(5_000);
    expect(notes[4_999]).not.toHaveProperty("x");
  });

  it("filters a local neighborhood and searches tags without dropping missing counts", () => {
    const notes = [note("A.md", ["B", "missing"]), note("B.md"), note("C.md")];
    notes[1].tags = ["research"];
    expect(
      projectKnowledgeGraph(notes, "A.md", "", true).nodes.map(
        (node) => node.id,
      ),
    ).toEqual(["A.md", "B.md"]);
    const result = projectKnowledgeGraph(notes, null, "research");
    expect(result.nodes.map((node) => node.id)).toEqual(["B.md"]);
    expect(result.missing).toBe(1);
  });
});
