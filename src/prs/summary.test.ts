import { describe, expect, test } from "vitest";
import type { PullRequest } from "../github/types";
import { pullRequest } from "../test-support";
import { deployBucketOf, deployProblems, minePipeline, mineProblems, summarizeDeploy, summarizeMine } from "./summary";

const many = (count: number, overrides: Partial<PullRequest>) =>
  Array.from({ length: count }, () => pullRequest(overrides));

describe("summarizeMine", () => {
  test("counts the PRs of each kind", () => {
    const prs = [
      pullRequest({ rollupState: "FAILURE" }),
      ...many(3, { rollupState: "PENDING", finishedChecks: 2, totalChecks: 5 }),
      pullRequest({ rollupState: "PENDING", finishedChecks: 4, totalChecks: 5 }),
      ...many(7, { rollupState: "SUCCESS", mergeStateStatus: "CLEAN" }),
      ...many(3, { rollupState: "SUCCESS", mergeStateStatus: "DIRTY" }),
      pullRequest({ rollupState: null }),
      ...many(18, { isDraft: true }),
    ];

    const summary = summarizeMine(prs);

    expect(summary).toMatchObject({
      open: 34, ready: 16, drafts: 18, failing: 1, running: 4, passed: 10, noChecks: 1, conflicts: 3,
    });
    expect(summary.runningShare).toBeCloseTo((3 * (2 / 5) + 4 / 5) / 4);
  });

  test("a failing draft is never a problem", () => {
    const prs = [
      pullRequest({ isDraft: true, rollupState: "FAILURE", mergeStateStatus: "DIRTY" }),
      pullRequest({ rollupState: "SUCCESS", mergeStateStatus: "CLEAN" }),
    ];

    expect(mineProblems(summarizeMine(prs))).toEqual([]);
  });

  test("the My PRs pipeline is grey with only drafts", () => {
    expect(minePipeline(summarizeMine(many(3, { isDraft: true })))).toBe("drafts");
  });

  test("the My PRs pipeline is the worst of the ready PRs", () => {
    const prs = [pullRequest({ rollupState: "SUCCESS" }), pullRequest({ rollupState: "PENDING" })];

    expect(minePipeline(summarizeMine(prs))).toBe("running");
  });

  test("problems come most urgent first", () => {
    const prs = [
      pullRequest({ rollupState: "FAILURE", mergeStateStatus: "CLEAN" }),
      ...many(2, { rollupState: "SUCCESS", mergeStateStatus: "DIRTY" }),
      ...many(3, { rollupState: "PENDING", mergeStateStatus: "CLEAN" }),
    ];

    expect(mineProblems(summarizeMine(prs))).toEqual([["failing", 1], ["conflicts", 2], ["running", 3]]);
  });
});

describe("summarizeDeploy", () => {
  const approved = { reviewDecision: "APPROVED" } as const;

  test.each([
    ["conflicts", { mergeStateStatus: "DIRTY", rollupState: "FAILURE" }],
    ["failing", { mergeStateStatus: "BEHIND", rollupState: "FAILURE" }],
    ["behind", { mergeStateStatus: "BEHIND", rollupState: "PENDING" }],
    ["running", { mergeStateStatus: "CLEAN", rollupState: "PENDING" }],
    ["ready", { mergeStateStatus: "CLEAN", rollupState: "SUCCESS" }],
    ["noChecks", { mergeStateStatus: "CLEAN", rollupState: null }],
  ] as const)("each approved PR counts once, in the first bucket that fits: %s", (bucket, overrides) => {
    const pr = pullRequest({ ...approved, ...overrides });

    expect(deployBucketOf(pr)).toBe(bucket);
    expect(summarizeDeploy([pr])).toMatchObject({ approved: 1, [bucket]: 1 });
  });

  test("the Deploy pipeline is the worst of all approved PRs", () => {
    const conflictsAndFailing = pullRequest({ ...approved, mergeStateStatus: "DIRTY", rollupState: "FAILURE" });
    const ready = pullRequest({ ...approved, mergeStateStatus: "CLEAN", rollupState: "SUCCESS" });

    const summary = summarizeDeploy([conflictsAndFailing, ready]);

    expect(summary).toMatchObject({ pipeline: "failing", failing: 0, conflicts: 1, ready: 1 });
  });

  test("the Deploy running share is the mean of the running bucket", () => {
    const prs = [
      pullRequest({ ...approved, mergeStateStatus: "CLEAN", rollupState: "PENDING", finishedChecks: 1, totalChecks: 2 }),
      pullRequest({ ...approved, mergeStateStatus: "CLEAN", rollupState: "PENDING", finishedChecks: 0, totalChecks: 2 }),
    ];

    expect(summarizeDeploy(prs).runningShare).toBeCloseTo(0.25);
  });

  test("problems come most urgent first", () => {
    const summary = summarizeDeploy(
      [
        pullRequest({ ...approved, mergeStateStatus: "CLEAN", rollupState: null }),
        pullRequest({ ...approved, mergeStateStatus: "BEHIND", rollupState: "PENDING" }),
        pullRequest({ ...approved, mergeStateStatus: "DIRTY", rollupState: "SUCCESS" }),
      ],
    );

    expect(deployProblems(summary)).toEqual([["conflicts", 1], ["behind", 1], ["noChecks", 1]]);
  });
});
