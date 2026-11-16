import { describe, expect, it, vi } from "vitest";
import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createFamiliarChat, type FamiliarChatDeps } from "./familiar-chat";

function session(id: string, patch: Partial<Session> = {}): Session {
  return { ...testSession("claude", "/work/demo"), id, ...patch };
}

function setup(initial: Session[]) {
  let open = initial;
  const scheduled: (() => void)[] = [];
  const deps: FamiliarChatDeps = {
    openSessions: () => open,
    commitSessions: (next) => {
      open = next;
    },
    persist: vi.fn(),
    schedule: (run) => {
      scheduled.push(run);
    },
  };

  return {
    deps,
    scheduled,
    chat: createFamiliarChat(deps),
    find: (id: string) => open.find((entry) => entry.id === id),
    setOpen: (next: Session[]) => {
      open = next;
    },
  };
}

const post: Block = { id: "post", role: "assistant", text: "Habit ran" };

describe("createFamiliarChat", () => {
  it("appends a block to an idle Familiar and persists it", () => {
    const { chat, deps, find } = setup([session("familiar")]);
    const then = vi.fn();

    chat.append("familiar", post, then);

    expect(find("familiar")?.blocks.at(-1)).toBe(post);
    expect(deps.persist).toHaveBeenCalledWith(find("familiar"));
    expect(then).toHaveBeenCalledWith(find("familiar"));
  });

  it("waits for a streaming reply to end before appending", () => {
    const { chat, scheduled, find, setOpen } = setup([session("familiar", { busy: true })]);

    chat.append("familiar", post);
    expect(find("familiar")?.blocks).not.toContain(post);

    setOpen([session("familiar")]);
    scheduled[0]();

    expect(find("familiar")?.blocks.at(-1)).toBe(post);
  });

  it("ignores a Familiar that is not open", () => {
    const { chat, deps } = setup([]);

    chat.append("familiar", post);

    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("records the answer on the relayed approval only", () => {
    const approval: Block = {
      id: "ask",
      role: "approval",
      text: "Run tests?",
      approval: { requestId: 1 },
    };
    const { chat, deps, find } = setup([
      session("familiar", { blocks: [approval, post] }),
      session("other", { blocks: [approval] }),
    ]);

    chat.decide("familiar", "ask", "allow");

    expect(find("familiar")?.blocks[0].approval?.decided).toBe("allow");
    expect(find("familiar")?.blocks[1]).toBe(post);
    expect(find("other")?.blocks[0]).toBe(approval);
    expect(deps.persist).toHaveBeenCalledWith(find("familiar"));
  });
});
