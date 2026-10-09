import { expect, it } from "vitest";
import {
  newSession,
  type Block,
  type MonoSpawnedSession,
} from "../../sessions/model/session";
import {
  familiarSpawnedSessions,
  recordFamiliarSpawnedSession,
  sanitizeFamiliarSpawnedSessions,
} from "./familiarSpawnedSessions";

const launch: MonoSpawnedSession = {
  sessionId: "app-mono-review",
  cwd: "/repo",
  title: "Review latest PR",
  harness: "codex",
  model: "gpt-6",
};

it("attaches accepted launches to their originating turn without mutating or duplicating them", () => {
  const mono = newSession("codex", "/repo");
  mono.blocks = [
    { id: "first", role: "user", text: "Review" },
    { id: "reply", role: "assistant", text: "Started" },
    { id: "second", role: "user", text: "Another task" },
  ];
  const updated = recordFamiliarSpawnedSession(mono, "first", launch);
  expect(mono.blocks[0].familiarSpawnedSessions).toBeUndefined();
  expect(updated.blocks[0].familiarSpawnedSessions).toEqual([launch]);
  expect(updated.blocks[2]).toBe(mono.blocks[2]);
  expect(familiarSpawnedSessions(updated.blocks.slice(0, 2))).toEqual([launch]);
  expect(familiarSpawnedSessions(updated.blocks.slice(2))).toEqual([]);
  expect(recordFamiliarSpawnedSession(updated, "first", launch)).toBe(updated);
  expect(recordFamiliarSpawnedSession(mono, "missing", launch)).toBe(mono);
  expect(recordFamiliarSpawnedSession(mono, "reply", launch)).toBe(mono);
});

function receipt(command = "molfar app sessions.start", ok = true): Block {
  return {
    id: "call",
    role: "tool",
    text: command,
    tool: {
      status: "completed",
      detail: JSON.stringify({
        ok,
        result: { ...launch, id: launch.sessionId },
      }),
    },
  };
}

it("recovers confirmed launches from older chats, including shell wrappers, and deduplicates metadata", () => {
  expect(familiarSpawnedSessions([receipt()])).toEqual([launch]);
  expect(
    familiarSpawnedSessions([
      receipt("/bin/zsh -lc 'molfar app sessions.start'"),
    ]),
  ).toEqual([launch]);
  expect(
    familiarSpawnedSessions([
      {
        id: "user",
        role: "user",
        text: "Review",
        familiarSpawnedSessions: [launch],
      },
      receipt(),
      receipt(),
    ]),
  ).toEqual([launch]);
});

it("does not turn failed, pending, unrelated or truncated output into session links", () => {
  const call = receipt();
  expect(
    familiarSpawnedSessions([
      receipt(undefined, false),
      receipt("molfar app sessions.read"),
      receipt("echo molfar app sessions.start"),
      { ...call, role: "assistant" },
      { ...call, tool: { ...call.tool, status: "in_progress" } },
      { ...call, tool: { ...call.tool, detail: '{"ok":true,"result":' } },
    ]),
  ).toEqual([]);
});

it("sanitizes saved references and strips extra fields", () => {
  expect(
    sanitizeFamiliarSpawnedSessions([
      { ...launch, title: "  Review  ", extra: "discard" },
      launch,
      { ...launch, sessionId: "../bad" },
      { ...launch, sessionId: "other", harness: "unknown" },
      { ...launch, sessionId: "empty", cwd: "" },
      null,
    ]),
  ).toEqual([{ ...launch, title: "Review" }]);
  expect(sanitizeFamiliarSpawnedSessions({})).toEqual([]);
});
