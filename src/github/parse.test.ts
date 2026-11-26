import { expect, test } from "vitest";
import { prNode, searchBody } from "../test-support";
import { GitHubRequestError } from "./errors";
import { parseMyPullRequests } from "./parse";

test("reads a pull request with its checks", () => {
  const {
    prs: [pr],
    totalCount,
  } = parseMyPullRequests(searchBody([prNode()], 120));
  expect(totalCount).toBe(120);
  expect(pr).toMatchObject({
    number: 10342,
    repository: "billing",
    owner: "acme",
    rollupState: "PENDING",
    finishedChecks: 9,
    totalChecks: 10,
    mergeStateStatus: "BEHIND",
  });
});

test("a pull request without checks has no rollup", () => {
  const [pr] = parseMyPullRequests(searchBody([prNode({ statusCheckRollup: null })])).prs;
  expect([pr.rollupState, pr.finishedChecks, pr.totalChecks]).toEqual([null, 0, 0]);
});

test("counts check runs and status contexts together", () => {
  const rollup = {
    state: "FAILURE",
    contexts: {
      checkRunCountsByState: [
        { state: "SUCCESS", count: 2 },
        { state: "SKIPPED", count: 1 },
        { state: "FAILURE", count: 1 },
      ],
      statusContextCountsByState: [
        { state: "NEUTRAL", count: 1 },
        { state: "PENDING", count: 3 },
      ],
    },
  };
  const node = prNode({ statusCheckRollup: rollup });
  const [pr] = parseMyPullRequests(searchBody([node])).prs;
  expect([pr.finishedChecks, pr.totalChecks]).toEqual([4, 8]);
});

test("skips search results that are not pull requests", () => {
  expect(parseMyPullRequests(searchBody([{}, prNode()])).prs).toHaveLength(1);
});

test("skips null search results", () => {
  expect(parseMyPullRequests(searchBody([null as unknown as object, prNode()])).prs).toHaveLength(1);
});

test.each([[null], [{ data: null }], [{ data: {} }], [{ data: { search: { issueCount: 1 } } }]])(
  "a response without search results is a request error: %j",
  (body) => {
    expect(() => parseMyPullRequests(body)).toThrow(new GitHubRequestError(200, "Unexpected GitHub response"));
  },
);
