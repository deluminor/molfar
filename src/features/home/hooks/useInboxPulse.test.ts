// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "../../inbox/model/githubTasks";
import { useInboxPulse, type InboxPulseState } from "./useInboxPulse";

const { listInboxItems } = vi.hoisted(() => ({
  listInboxItems: vi.fn(),
}));

vi.mock("../../inbox/model/githubTasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../inbox/model/githubTasks")>()),
  listInboxItems,
  inboxProjectsForRail: (
    recents: readonly { path: string; openedAt: number }[],
    _cwd: string,
  ) => recents.map((recent) => ({ path: recent.path, openedAt: recent.openedAt })),
}));

vi.mock("../../inbox/model/inboxActivityRequest", () => ({
  inboxActivityRequest: () => ({
    pruned: {},
    query: {
      assignedToMe: false,
      state: "open",
      search: "",
      linearHiddenTeamIds: [],
      jiraHiddenProjectIds: [],
    },
  }),
}));

vi.mock("../../inbox/model/inboxFilters", () => ({
  applyInboxFiltersBySource: (items: InboxItem[]) => items,
}));

vi.mock("../../inbox/model/inboxSeen", () => ({
  isInboxEntryUnseen: () => false,
  useInboxSeenTick: () => undefined,
}));

const first: InboxItem = {
  provider: "github",
  kind: "pr",
  repo: "acme/app",
  number: 1,
  title: "First",
  url: "https://github.com/acme/app/pull/1",
  state: "open",
  updatedAt: "2026-09-13T12:00:00Z",
  labels: [],
  assignees: [],
  draft: false,
  projectPath: "/a",
};

let container: HTMLDivElement;
let root: Root;
let latest: InboxPulseState | null = null;

function Probe({
  paths,
  cwd,
  enabled = true,
}: {
  paths: readonly string[];
  cwd: string;
  enabled?: boolean;
}) {
  latest = useInboxPulse(paths, cwd, enabled);
  return null;
}

async function render(
  paths: readonly string[],
  cwd: string,
  enabled = true,
): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe, { paths, cwd, enabled }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listInboxItems.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
  latest = null;
});

afterEach(async () => {
  await act(async () => root.unmount());
  latest = null;
  vi.unstubAllGlobals();
});

describe("useInboxPulse", () => {
  it("clears prior rows while a refetch for new paths is in flight", async () => {
    let resolveFirst: ((value: { items: InboxItem[]; errors: object }) => void)
      | undefined;
    listInboxItems.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    listInboxItems.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* leave second fetch pending */
        }),
    );

    await render(["/a"], "/a");
    await act(async () => {
      resolveFirst?.({ items: [first], errors: {} });
    });
    expect(latest).toMatchObject({
      status: "ready",
      pulse: { rows: [expect.objectContaining({ title: "First" })] },
    });

    await render(["/b"], "/b");
    expect(latest).toEqual({ status: "loading" });
  });

  it("does not fetch when disabled", async () => {
    await render(["/a"], "/a", false);
    expect(listInboxItems).not.toHaveBeenCalled();
    expect(latest).toEqual({ status: "loading" });
  });
});
