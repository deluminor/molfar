import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/session/block";
import { molfarToolCall, molfarWorkSummary } from "./molfar-tool-call";

function shell(text: string): Block {
  return { id: text, role: "tool", text, tool: { kind: "shell" } };
}

describe("MOLFAR CLI tool calls", () => {
  it("recognizes app actions with absolute, quoted, or bare executables", () => {
    expect(
      molfarToolCall(
        shell(
          "/repo/target/debug/MOLFAR.app/Contents/MacOS/molfar app notes.list --json '{}'",
        ),
      )?.label,
    ).toBe("List notes");
    expect(
      molfarToolCall(
        shell(
          "'/Applications/MOLFAR App/molfar' app folders.move --input -",
        ),
      )?.label,
    ).toBe("Move a session");
    expect(
      molfarToolCall(
        shell('"C:\\Program Files\\MOLFAR\\molfar.exe" app notes.list'),
      )?.label,
    ).toBe("List notes");
    expect(molfarToolCall(shell("molfar app --help"))?.label).toBe(
      "View CLI commands",
    );
    expect(
      molfarToolCall(shell("molfar app sessions.read --json '{}'"))?.label,
    ).toBe("Read a session");
    expect(
      molfarToolCall(shell("molfar app sessions.send --json '{}'"))?.label,
    ).toBe("Continue a session");
    expect(
      molfarToolCall(shell("molfar app sessions.draft --json '{}'"))?.label,
    ).toBe("Save a draft");
    expect(
      molfarToolCall(shell("molfar app notes.write --input -"))?.label,
    ).toBe("Write a note");
    expect(
      molfarToolCall({
        id: "generic",
        role: "tool",
        text: "Run command:",
        tool: { kind: "other", title: "molfar app sessions.start" },
      })?.label,
    ).toBe("Start a session");
    expect(
      molfarToolCall({
        id: "codex-action",
        role: "tool",
        text: "List",
        tool: {
          kind: "execute",
          preview: { kind: "shell", title: "molfar app notes.list" },
        },
      })?.label,
    ).toBe("List notes");
  });

  it("does not restyle unrelated commands or text mentioning the CLI", () => {
    expect(
      molfarToolCall(shell("echo molfar app notes.list")),
    ).toBeUndefined();
    expect(molfarToolCall(shell("molfar control list"))).toBeUndefined();
    expect(
      molfarToolCall({
        id: "prose",
        role: "assistant",
        text: "molfar app notes.list",
      }),
    ).toBeUndefined();
  });

  it("does not compact compound shell commands or hide a longer shell preview", () => {
    for (const command of [
      "molfar app notes.list && echo extra",
      "molfar app notes.list; echo extra",
      "molfar app notes.list | cat",
      "molfar app notes.list\necho extra",
      "molfar app notes.list --json \"$(echo extra)\"",
    ]) {
      expect(molfarToolCall(shell(command))).toBeUndefined();
    }
    expect(
      molfarToolCall({
        id: "short-title",
        role: "tool",
        text: "molfar app notes.list",
        tool: {
          kind: "shell",
          title: "molfar app notes.list",
          preview: {
            kind: "shell",
            title: "molfar app notes.list && echo extra",
          },
        },
      }),
    ).toBeUndefined();
    expect(
      molfarToolCall(
        shell("molfar app sessions.send --json '{\"prompt\":\"a; b\"}'"),
      )?.command,
    ).toBe("molfar app sessions.send --json '{\"prompt\":\"a; b\"}'");
  });

  it("names a group only when all its tool calls use MOLFAR", () => {
    const calls = [
      shell("molfar app --help"),
      shell("molfar app notes.list"),
    ];
    expect(molfarWorkSummary(calls, true)).toBe("Using MOLFAR");
    expect(molfarWorkSummary(calls, false)).toBe("Used MOLFAR");
    expect(
      molfarWorkSummary([...calls, shell("git status")], true),
    ).toBeUndefined();
  });
});
