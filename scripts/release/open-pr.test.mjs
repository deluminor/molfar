import { describe, expect, it, vi } from "vitest";
import {
  createPullRequestRest,
  isCreatePullRequestRaceError,
  openOrReusePullRequest,
  restHeadRef,
  waitForHeadAhead,
} from "./open-pr.mjs";

const SHA = "860ae8622a5f81f52671b2a79e97add1981c07ed";

describe("isCreatePullRequestRaceError", () => {
  it("matches the GraphQL race GitHub returns after a fresh head push", () => {
    expect(
      isCreatePullRequestRaceError(
        "pull request create failed: GraphQL: Head sha can't be blank, Base sha can't be blank, No commits between main and release/v1.0.5, Head ref must be a branch (createPullRequest)",
      ),
    ).toBe(true);
  });

  it("matches a concurrent-create collision", () => {
    expect(
      isCreatePullRequestRaceError(
        'HTTP 422: Validation Failed (https://api.github.com/repos/deluminor/molfar/pulls)\nA pull request already exists for deluminor:release/v1.0.5.',
      ),
    ).toBe(true);
  });

  it("rejects unrelated failures", () => {
    expect(isCreatePullRequestRaceError("GraphQL: Resource not accessible by integration")).toBe(
      false,
    );
  });
});

describe("restHeadRef", () => {
  it("prefixes the repository owner for a bare branch name", () => {
    expect(restHeadRef("deluminor/molfar", "release/v1.0.5")).toBe("deluminor:release/v1.0.5");
  });

  it("keeps an explicit owner:branch head", () => {
    expect(restHeadRef("deluminor/molfar", "deluminor:release/v1.0.5")).toBe(
      "deluminor:release/v1.0.5",
    );
  });
});

describe("createPullRequestRest", () => {
  it("POSTs to the pulls REST endpoint with owner:head", () => {
    const apiJson = vi.fn(() => ({
      html_url: "https://github.com/deluminor/molfar/pull/63",
    }));

    const url = createPullRequestRest({
      repository: "deluminor/molfar",
      base: "main",
      head: "release/v1.0.5",
      title: "chore(release): v1.0.5",
      body: "bump",
      apiJson,
    });

    expect(url).toBe("https://github.com/deluminor/molfar/pull/63");
    expect(apiJson).toHaveBeenCalledWith("repos/deluminor/molfar/pulls", {
      method: "POST",
      fields: {
        title: "chore(release): v1.0.5",
        body: "bump",
        head: "deluminor:release/v1.0.5",
        base: "main",
      },
    });
  });

  it("fails when html_url is missing", () => {
    expect(() =>
      createPullRequestRest({
        repository: "deluminor/molfar",
        base: "main",
        head: "release/v1.0.5",
        title: "t",
        body: "b",
        apiJson: () => ({}),
      }),
    ).toThrow(/no html_url/);
  });
});

describe("waitForHeadAhead", () => {
  it("returns once the tip matches and compare is ahead", () => {
    const apiJson = vi
      .fn()
      .mockReturnValueOnce({ sha: "deadbeef" })
      .mockReturnValueOnce({ ahead_by: 0 })
      .mockReturnValueOnce({ sha: SHA })
      .mockReturnValueOnce({ ahead_by: 1 });
    const delay = vi.fn();

    const result = waitForHeadAhead({
      repository: "deluminor/molfar",
      base: "main",
      head: "release/v1.0.5",
      expectedSha: SHA,
      attempts: 5,
      delayMs: 1,
      delay,
      apiJson,
    });

    expect(result).toEqual({ tipSha: SHA, aheadBy: 1, attempts: 2 });
    expect(delay).toHaveBeenCalledOnce();
  });

  it("fails after exhausting attempts", () => {
    const apiJson = vi.fn(() => {
      throw new Error("Not Found");
    });

    expect(() =>
      waitForHeadAhead({
        repository: "deluminor/molfar",
        base: "main",
        head: "release/v1.0.5",
        expectedSha: SHA,
        attempts: 2,
        delayMs: 1,
        delay: () => {},
        apiJson,
      }),
    ).toThrow(/still does not see/);
  });
});

describe("openOrReusePullRequest", () => {
  it("reuses an already-open PR", () => {
    const url = openOrReusePullRequest({
      base: "main",
      head: "release/v1.0.5",
      listOpenPrUrl: () => "https://github.com/deluminor/molfar/pull/62",
      createPr: () => {
        throw new Error("should not create");
      },
    });
    expect(url).toBe("https://github.com/deluminor/molfar/pull/62");
  });

  it("retries create race errors then succeeds", () => {
    const createPr = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("GraphQL: No commits between main and release/v1.0.5");
      })
      .mockReturnValueOnce("https://github.com/deluminor/molfar/pull/63\n");
    const delay = vi.fn();

    const url = openOrReusePullRequest({
      base: "main",
      head: "release/v1.0.5",
      createAttempts: 3,
      delayMs: 1,
      delay,
      listOpenPrUrl: () => null,
      createPr,
    });

    expect(url).toBe("https://github.com/deluminor/molfar/pull/63");
    expect(createPr).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(1);
  });

  it("reuses a PR when create reports it already exists", () => {
    const listOpenPrUrl = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("https://github.com/deluminor/molfar/pull/63");

    const url = openOrReusePullRequest({
      base: "main",
      head: "release/v1.0.5",
      createAttempts: 3,
      delay: () => {},
      listOpenPrUrl,
      createPr: () => {
        throw new Error("A pull request already exists for deluminor:release/v1.0.5.");
      },
    });

    expect(url).toBe("https://github.com/deluminor/molfar/pull/63");
  });

  it("does not retry non-race create failures", () => {
    expect(() =>
      openOrReusePullRequest({
        base: "main",
        head: "release/v1.0.5",
        createAttempts: 3,
        delay: () => {},
        listOpenPrUrl: () => null,
        createPr: () => {
          throw new Error("GraphQL: Resource not accessible by integration");
        },
      }),
    ).toThrow(/Resource not accessible/);
  });
});
