import { describe, expect, test } from "vitest";
import { pullRequest } from "../test-support";
import { deployList, isDeployable } from "./deploy";

const approved = { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN" } as const;

describe("isDeployable", () => {
  test.each([
    ["approved into the default branch", { ...approved, baseRefName: "main" }, "main", true],
    ["approved into another branch", { ...approved, baseRefName: "feature/x" }, "main", false],
    ["into master with an unknown default branch", { ...approved, baseRefName: "master" }, undefined, true],
    ["into develop with an unknown default branch", { ...approved, baseRefName: "develop" }, undefined, false],
    ["into develop when develop is the default", { ...approved, baseRefName: "develop" }, "develop", true],
    ["changes requested", { ...approved, reviewDecision: "CHANGES_REQUESTED" }, "main", false],
    ["a draft", { ...approved, isDraft: true }, "main", false],
  ] as const)("only PRs into the default branch are deployable: %s", (_name, overrides, defaultBranch, expected) => {
    expect(isDeployable(pullRequest(overrides), defaultBranch)).toBe(expected);
  });
});

describe("deployList", () => {
  test("ready PRs come first, then the rest, newest first", () => {
    const behindNewest = pullRequest({ ...approved, number: 1, mergeStateStatus: "BEHIND", rollupState: "SUCCESS" });
    const readyNewer = pullRequest({ ...approved, number: 2, rollupState: "SUCCESS" });
    const runningOlder = pullRequest({ ...approved, number: 3, rollupState: "PENDING" });
    const readyOlder = pullRequest({ ...approved, number: 4, rollupState: "SUCCESS" });
    const notDeployable = pullRequest({ number: 5 });

    const list = deployList([behindNewest, readyNewer, runningOlder, readyOlder, notDeployable], () => "main");

    expect(list.map((pr) => pr.number)).toEqual([2, 4, 1, 3]);
  });
});
