import { describe, expect, test } from "vitest";
import type { PullRequest } from "../github/types";
import { FailureClock, PULSE_MS } from "./failure-clock";

function pullRequest(rollupState: PullRequest["rollupState"]): PullRequest {
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
    rollupState,
    finishedChecks: 0,
    totalChecks: 0,
  };
}

describe("FailureClock", () => {
  const failed = pullRequest("FAILURE");
  const passed = pullRequest("SUCCESS");
  let clock: FailureClock;

  test("a failed pull request pulses for 5 minutes, then stays solid", () => {
    clock = new FailureClock();
    clock.update([failed], 1_000);

    expect(clock.isPulsing(failed, 1_000 + PULSE_MS - 1)).toBe(true);
    expect(clock.isPulsing(failed, 1_000 + PULSE_MS)).toBe(false);
  });

  test("a pull request that fails again pulses again", () => {
    clock = new FailureClock();
    clock.update([failed], 0);
    clock.update([passed], 10_000);
    clock.update([failed], PULSE_MS + 20_000);

    expect(clock.isPulsing(failed, PULSE_MS + 20_000 + 1)).toBe(true);
  });

  test("a pull request that has not failed does not pulse", () => {
    clock = new FailureClock();
    clock.update([passed], 0);

    expect(clock.isPulsing(passed, 1)).toBe(false);
  });
});
