import { describe, expect, test } from "vitest";
import type { PullRequest } from "../github/types";
import {
  finishedShareOf,
  leadOf,
  parseJiraProjects,
  pipelineOf,
  prIdentity,
  problemOf,
  reviewOf,
  sortMyPrs,
} from "./derive";

const JIRA_PROJECTS = ["ABC", "XYZ"];

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: "Some change",
    url: "https://github.com/acme/billing/pull/1",
    createdAt: "2026-11-20T10:00:00Z",
    isDraft: false,
    headRefName: "feature",
    baseRefName: "main",
    reviewDecision: "REVIEW_REQUIRED",
    mergeStateStatus: "CLEAN",
    repository: "billing",
    owner: "acme",
    rollupState: null,
    finishedChecks: 0,
    totalChecks: 0,
    ...overrides,
  };
}

describe("pipelineOf", () => {
  test.each([
    ["SUCCESS", "passed"],
    ["FAILURE", "failed"],
    ["ERROR", "failed"],
    ["PENDING", "running"],
    ["EXPECTED", "running"],
    [null, "none"],
  ] as const)("maps the rollup state %s to a pipeline", (rollupState, expected) => {
    expect(pipelineOf(pullRequest({ rollupState }))).toBe(expected);
  });
});

describe("reviewOf", () => {
  test.each([
    [true, "APPROVED", "CLEAN", "draft"],
    [false, "CHANGES_REQUESTED", "CLEAN", "changes"],
    [false, "APPROVED", "BEHIND", "behind"],
    [false, "APPROVED", "DIRTY", "conflicts"],
    [false, "APPROVED", "CLEAN", "approved"],
    [false, "REVIEW_REQUIRED", "CLEAN", "review"],
    [false, null, "CLEAN", "review"],
  ] as const)(
    "maps draft=%s, decision %s and merge state %s to a review state",
    (isDraft, reviewDecision, mergeStateStatus, expected) => {
      expect(reviewOf(pullRequest({ isDraft, reviewDecision, mergeStateStatus }))).toBe(expected);
    },
  );
});

describe("leadOf", () => {
  test.each([
    ["ABC-20415 Profile page", "feature", "ABC-20415", "Profile page"],
    ["ABC-20415: Profile page", "feature", "ABC-20415", "Profile page"],
    ["Bulk edit users", "abc-20467-x", "ABC-20467", "Bulk edit users"],
    ["XYZ-2051 OAuth2", "abc-1", "XYZ-2051", "OAuth2"],
    ["UTF-8 fix", "feature", null, "UTF-8 fix"],
    ["ABC-1", "feature", "ABC-1", "ABC-1"],
  ])("finds the ticket in the title, else in the branch: %s on %s", (title, headRefName, ticket, expectedTitle) => {
    expect(leadOf(pullRequest({ title, headRefName }), JIRA_PROJECTS)).toEqual({
      ticket,
      title: expectedTitle,
    });
  });

  test("a ticket of a project that is not in the list is no ticket", () => {
    expect(leadOf(pullRequest({ title: "ABC-1 Fix", headRefName: "feature" }), ["XYZ"])).toEqual({
      ticket: null,
      title: "ABC-1 Fix",
    });
  });

  test("with no Jira projects nothing is a ticket", () => {
    expect(leadOf(pullRequest({ title: "ABC-20415 Profile page", headRefName: "abc-1" }), [])).toEqual({
      ticket: null,
      title: "ABC-20415 Profile page",
    });
  });
});

describe("parseJiraProjects", () => {
  test("parses the Jira projects setting", () => {
    expect(parseJiraProjects(" abc, XYZ ,, ")).toEqual(["ABC", "XYZ"]);
  });
});

describe("problemOf", () => {
  test.each([
    ["behind on master", { reviewDecision: "APPROVED", mergeStateStatus: "BEHIND", baseRefName: "master" }, "behind master"],
    ["approved and conflicting", { reviewDecision: "APPROVED", mergeStateStatus: "DIRTY" }, "conflicts"],
    ["in review and conflicting", { reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "DIRTY" }, "conflicts"],
    ["a draft and conflicting", { isDraft: true, mergeStateStatus: "DIRTY" }, null],
    ["changes requested and conflicting", { reviewDecision: "CHANGES_REQUESTED", mergeStateStatus: "DIRTY" }, "changes asked"],
    ["in review and clean", { reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "CLEAN" }, null],
  ] as const)("names the problem that takes the place of the repo: %s", (_name, overrides, expected) => {
    expect(problemOf(pullRequest(overrides))).toBe(expected);
  });
});

describe("sortMyPrs", () => {
  test("orders newest first, then by repository and number", () => {
    const oldest = pullRequest({ number: 1, createdAt: "2026-11-18T10:00:00Z" });
    const newest = pullRequest({ number: 9, createdAt: "2026-11-21T10:00:00Z", repository: "zeta" });
    const sameDayWebshop = pullRequest({ number: 3, createdAt: "2026-11-20T10:00:00Z", repository: "webshop" });
    const sameDayBillingHigh = pullRequest({ number: 8, createdAt: "2026-11-20T10:00:00Z" });
    const sameDayBillingLow = pullRequest({ number: 2, createdAt: "2026-11-20T10:00:00Z" });

    const sorted = sortMyPrs([oldest, sameDayWebshop, sameDayBillingHigh, newest, sameDayBillingLow]);

    expect(sorted).toEqual([newest, sameDayBillingLow, sameDayBillingHigh, sameDayWebshop, oldest]);
  });
});

describe("finishedShareOf", () => {
  test("counts finished checks of all checks", () => {
    expect(finishedShareOf(pullRequest({ finishedChecks: 9, totalChecks: 10 }))).toBe(9 / 10);
  });

  test("is zero without checks", () => {
    expect(finishedShareOf(pullRequest())).toBe(0);
  });
});

describe("prIdentity", () => {
  test("joins owner, repository and number", () => {
    expect(prIdentity(pullRequest({ owner: "acme", repository: "billing", number: 42 }))).toBe("acme/billing#42");
  });
});
