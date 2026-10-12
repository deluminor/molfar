import { expect, it } from "vitest";
import {
  newSession,
  type Block,
  type MonoSpawnedSession,
} from "../../sessions/model/session";
import {
  launchedSessionState,
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

function appReceipt(action: string, result: unknown): Block {
  return {
    id: action,
    role: "tool",
    text: action,
    tool: {
      status: "completed",
      preview: {
        kind: "shell",
        title: `/bin/zsh -lc 'molfar app ${action}'`,
      },
      detail: JSON.stringify({ ok: true, result }),
    },
  };
}

it("recovers accepted follow-ups to existing sessions without linking every listed session", () => {
  const other = {
    ...launch,
    sessionId: "existing-session",
    title: "Second article",
  };
  const listing = appReceipt("sessions.list", {
    cwd: launch.cwd,
    sessions: [launch, other].map((entry) => ({
      ...entry,
      id: entry.sessionId,
    })),
  });
  const send = appReceipt("sessions.send", {
    sessionId: other.sessionId,
    submitted: true,
    alreadySubmitted: false,
    notifyOnComplete: true,
  });
  expect(familiarSpawnedSessions([listing])).toEqual([]);
  expect(familiarSpawnedSessions([listing, send, send])).toEqual([other]);
  // The listing can be in a different folded work group from the follow-up.
  expect(familiarSpawnedSessions([send], [other])).toEqual([other]);
  expect(familiarSpawnedSessions([send])).toEqual([]);
  expect(
    familiarSpawnedSessions([
      listing,
      send,
      appReceipt("sessions.send", {
        sessionId: launch.sessionId,
        submitted: true,
        alreadySubmitted: true,
      }),
    ]),
  ).toEqual([other, launch]);
});

it("requires a successful submission and trustworthy session details to recover a follow-up", () => {
  const send = appReceipt("sessions.send", {
    sessionId: launch.sessionId,
    submitted: true,
  });
  const listing = appReceipt("sessions.list", {
    cwd: launch.cwd,
    sessions: [{ ...launch, id: launch.sessionId }],
  });
  const malformedListing = {
    ...listing,
    tool: { ...listing.tool, detail: '{"ok":true,"result":' },
  };
  expect(
    familiarSpawnedSessions([
      listing,
      appReceipt("sessions.send", {
        sessionId: launch.sessionId,
        submitted: false,
      }),
      appReceipt("sessions.read", {
        sessionId: launch.sessionId,
        submitted: true,
      }),
      appReceipt("sessions.draft", {
        sessionId: launch.sessionId,
        submitted: true,
      }),
      appReceipt("sessions.send", { sessionId: "unlisted", submitted: true }),
      { ...send, role: "assistant" },
      { ...send, tool: { ...send.tool, status: "in_progress" } },
      {
        ...send,
        tool: {
          ...send.tool,
          detail: JSON.stringify({
            ok: false,
            result: { sessionId: launch.sessionId, submitted: true },
          }),
        },
      },
    ]),
  ).toEqual([]);
  expect(familiarSpawnedSessions([malformedListing, send])).toEqual([]);
  expect(
    familiarSpawnedSessions([
      { ...listing, tool: { ...listing.tool, status: "failed" } },
      send,
    ]),
  ).toEqual([]);
});

it("keeps a reused session in both Familiars without moving or duplicating its original card", () => {
  const first = {
    ...newSession("codex", "/repo"),
    blocks: [{ id: "first", role: "user" as const, text: "Start" }],
  };
  const second = {
    ...newSession("codex", "/repo"),
    blocks: [{ id: "second", role: "user" as const, text: "Continue" }],
  };
  const original = recordFamiliarSpawnedSession(first, "first", launch);
  const followUp = recordFamiliarSpawnedSession(second, "second", launch);
  expect(familiarSpawnedSessions(original.blocks)).toEqual([launch]);
  expect(familiarSpawnedSessions(followUp.blocks)).toEqual([launch]);
  expect(second.blocks[0]).not.toHaveProperty("familiarSpawnedSessions");
  expect(recordFamiliarSpawnedSession(followUp, "second", launch)).toBe(followUp);
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

it("reads a launched session's state for its card", () => {
  const session = newSession("codex", "/repo");
  const ran = (blocks: Block[], extra = {}) =>
    launchedSessionState({ ...session, blocks, ...extra });
  const prompt: Block = { id: "u", role: "user", text: "Fix it" };
  expect(ran([prompt], { busy: true })).toBe("working");
  // Waiting on the user outranks working, so the card asks for attention.
  expect(
    ran(
      [
        prompt,
        { id: "a", role: "tool", text: "rm", approval: { requestId: 1 } },
      ],
      { busy: true },
    ),
  ).toBe("input");
  expect(ran([{ ...prompt, draft: true }])).toBe("draft");
  expect(
    ran([prompt, { id: "e", role: "system", text: "Boom", notice: "error" }]),
  ).toBe("failed");
  expect(
    ran([
      prompt,
      { id: "i", role: "system", text: "Stopped", notice: "interrupt" },
    ]),
  ).toBe("stopped");
  expect(ran([prompt, { id: "r", role: "assistant", text: "Done." }])).toBe(
    "done",
  );
});
