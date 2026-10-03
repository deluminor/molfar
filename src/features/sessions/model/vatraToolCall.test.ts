import { describe, expect, it } from "vitest";
import type { Block } from "./session";
import { vatraToolCall, vatraWorkSummary } from "./vatraToolCall";

function shell(text: string): Block {
  return { id: text, role: "tool", text, tool: { kind: "shell" } };
}

describe("Vatra CLI tool calls", () => {
  it("recognizes app actions with absolute, quoted, or bare executables", () => {
    expect(
      vatraToolCall(
        shell(
          "/repo/target/debug/Vatra.app/Contents/MacOS/vatra app notes.list --json '{}'",
        ),
      )?.label,
    ).toBe("List notes");
    expect(
      vatraToolCall(
        shell(
          "'/Applications/Vatra App/vatra' app folders.move --input -",
        ),
      )?.label,
    ).toBe("Move a session");
    expect(
      vatraToolCall(
        shell('"C:\\Program Files\\Vatra\\vatra.exe" app notes.list'),
      )?.label,
    ).toBe("List notes");
    expect(vatraToolCall(shell("vatra app --help"))?.label).toBe(
      "View CLI commands",
    );
    expect(
      vatraToolCall(shell("vatra app sessions.read --json '{}'"))?.label,
    ).toBe("Read a session");
    expect(
      vatraToolCall(shell("vatra app sessions.send --json '{}'"))?.label,
    ).toBe("Continue a session");
    expect(
      vatraToolCall(shell("vatra app sessions.draft --json '{}'"))?.label,
    ).toBe("Save a draft");
    expect(
      vatraToolCall(shell("vatra app notes.write --input -"))?.label,
    ).toBe("Write a note");
    expect(
      vatraToolCall({
        id: "generic",
        role: "tool",
        text: "Run command:",
        tool: { kind: "other", title: "vatra app sessions.start" },
      })?.label,
    ).toBe("Start a session");
    expect(
      vatraToolCall({
        id: "codex-action",
        role: "tool",
        text: "List",
        tool: {
          kind: "execute",
          preview: { kind: "shell", title: "vatra app notes.list" },
        },
      })?.label,
    ).toBe("List notes");
  });

  it("does not restyle unrelated commands or text mentioning the CLI", () => {
    expect(
      vatraToolCall(shell("echo vatra app notes.list")),
    ).toBeUndefined();
    expect(vatraToolCall(shell("vatra control list"))).toBeUndefined();
    expect(
      vatraToolCall({
        id: "prose",
        role: "assistant",
        text: "vatra app notes.list",
      }),
    ).toBeUndefined();
  });

  it("does not compact compound shell commands or hide a longer shell preview", () => {
    for (const command of [
      "vatra app notes.list && echo extra",
      "vatra app notes.list; echo extra",
      "vatra app notes.list | cat",
      "vatra app notes.list\necho extra",
      "vatra app notes.list --json \"$(echo extra)\"",
    ]) {
      expect(vatraToolCall(shell(command))).toBeUndefined();
    }
    expect(
      vatraToolCall({
        id: "short-title",
        role: "tool",
        text: "vatra app notes.list",
        tool: {
          kind: "shell",
          title: "vatra app notes.list",
          preview: {
            kind: "shell",
            title: "vatra app notes.list && echo extra",
          },
        },
      }),
    ).toBeUndefined();
    expect(
      vatraToolCall(
        shell("vatra app sessions.send --json '{\"prompt\":\"a; b\"}'"),
      )?.command,
    ).toBe("vatra app sessions.send --json '{\"prompt\":\"a; b\"}'");
  });

  it("names a group only when all its tool calls use Vatra", () => {
    const calls = [
      shell("vatra app --help"),
      shell("vatra app notes.list"),
    ];
    expect(vatraWorkSummary(calls, true)).toBe("Using Vatra");
    expect(vatraWorkSummary(calls, false)).toBe("Used Vatra");
    expect(
      vatraWorkSummary([...calls, shell("git status")], true),
    ).toBeUndefined();
  });
});
