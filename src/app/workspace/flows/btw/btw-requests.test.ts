import { describe, expect, it } from "vitest";
import { createBtwRequests } from "./btw-requests";

describe("createBtwRequests", () => {
  it("replaces a thread's earlier request", () => {
    const requests = createBtwRequests();
    const first = requests.start("s", "t");
    const second = requests.start("s", "t");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("keeps a newer request when an older one finishes", () => {
    const requests = createBtwRequests();
    const first = requests.start("s", "t");
    const second = requests.start("s", "t");

    requests.finish("s", "t", first);
    requests.abortAll();

    expect(second.signal.aborted).toBe(true);
  });

  it("aborts only the requests of closed sessions", () => {
    const requests = createBtwRequests();
    const open = requests.start("open", "t");
    const closed = requests.start("closed", "t");

    requests.abortClosed(new Set(["open"]));

    expect(open.signal.aborted).toBe(false);
    expect(closed.signal.aborted).toBe(true);
  });
});
