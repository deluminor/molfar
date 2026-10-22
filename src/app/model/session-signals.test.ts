import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab } from "@/features/workspace/model/layout";
import { providerSignInRequest, providerSignInRequestKey } from "./provider-sign-in";
import { isBusySession, openSessionIds, sessionIdsWithLeads, setsEqual } from "./session-id-sets";

const session = (fields: Partial<Session>) => ({ blocks: [], ...fields }) as unknown as Session;
const authError = { id: "b2", role: "system", notice: "error", text: "Not logged in" };

describe("session id sets", () => {
  it("collects matching sessions with their orchestration leads", () => {
    const sessions = [
      session({ id: "worker", busy: true, orchestrationLeadId: "lead" }),
      session({ id: "idle" }),
      session({ id: "solo", busy: true }),
    ];

    expect([...sessionIdsWithLeads(sessions, isBusySession)]).toEqual(["worker", "lead", "solo"]);
  });

  it("compares sets by contents and lists the sessions open in tabs", () => {
    expect(setsEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(setsEqual(new Set(["a"]), new Set(["b"]))).toBe(false);
    expect([...openSessionIds([newTab("s1"), newTab("s2")])]).toEqual(["s1", "s2"]);
  });
});

describe("provider sign-in", () => {
  it("asks once per turn that failed to authenticate", () => {
    const failed = session({
      id: "s1",
      harness: "claude",
      blocks: [{ id: "u1", role: "user", text: "hi" }, authError] as Session["blocks"],
    });

    expect(providerSignInRequest(failed)).toEqual({ key: "s1:u1", sessionId: "s1", harness: "claude" });
    expect(providerSignInRequestKey(session({ id: "s2", blocks: [authError] as Session["blocks"] }))).toBe(
      "s2:b2",
    );
  });

  it("does not ask without an auth error or a harness that can sign in", () => {
    expect(providerSignInRequest(undefined)).toBeNull();
    expect(providerSignInRequest(session({ id: "s1", harness: "claude" }))).toBeNull();
    expect(
      providerSignInRequest(session({ id: "s1", harness: "pi", blocks: [authError] as Session["blocks"] })),
    ).toBeNull();
  });
});
