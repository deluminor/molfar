import { describe, expect, it } from "vitest";
import type { LinkedWorkItem } from "@/domain/session/session";
import { summaryFromSession } from "@/features/sessions/data/session-history";
import { testSession } from "@/integrations/harness/core/test-session";
import { inboxRelatedSessions } from "./inbox-related-sessions";

const linked: LinkedWorkItem = { kind: "issue", repo: "acme/app", number: 1, url: "u" };

describe("inboxRelatedSessions", () => {
  it("merges linked chats from storage, history and open sessions, newest first", () => {
    const open = { ...testSession("claude", "/work/demo"), id: "a", title: "Live title", linkedWorkItem: linked };
    const stored = { ...summaryFromSession(open), title: "Stored title", updatedAt: 10 };
    const older = { ...summaryFromSession({ ...open, id: "b" }), updatedAt: 1 };
    const unlinked = { ...summaryFromSession({ ...open, id: "c", linkedWorkItem: undefined }), updatedAt: 50 };
    const ask = { ...open, id: "d", inboxAsk: { key: "k", title: "t", url: "u", provider: "github" as const } };

    const related = inboxRelatedSessions([stored], [older, unlinked], [open, ask]);

    expect(related.map((session) => session.id)).toEqual(["a", "b"]);
    expect(related[0]).toMatchObject({ title: "Live title", updatedAt: 10 });
  });
});
