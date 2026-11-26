import { describe, expect, test } from "vitest";
import type { PullRequest } from "../github/types";
import { orderSlotKeys, slotContents, type SlotKey } from "./slots";

function pullRequests(count: number): PullRequest[] {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    title: `Change ${index + 1}`,
    url: `https://github.com/acme/billing/pull/${index + 1}`,
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
  }));
}

function kinds(prs: PullRequest[], slotCount: number, totalCount = prs.length): string[] {
  return slotContents(prs, slotCount, totalCount).map((content) => content.kind);
}

describe("orderSlotKeys", () => {
  test("orders keys by device, then row, then column", () => {
    const keys: SlotKey[] = [
      { id: "b-0-1", deviceId: "B", row: 0, column: 1 },
      { id: "a-1-0", deviceId: "A", row: 1, column: 0 },
      { id: "a-0-2", deviceId: "A", row: 0, column: 2 },
      { id: "b-0-0", deviceId: "B", row: 0, column: 0 },
      { id: "a-0-1", deviceId: "A", row: 0, column: 1 },
    ];

    expect(orderSlotKeys(keys).map((key) => key.id)).toEqual(["a-0-1", "a-0-2", "a-1-0", "b-0-0", "b-0-1"]);
  });
});

describe("slotContents", () => {
  test("slot n shows pull request n", () => {
    const prs = pullRequests(3);

    expect(slotContents(prs, 3, 3).map((content) => (content.kind === "pr" ? content.pr.number : null))).toEqual([1, 2, 3]);
  });

  test("fills free slots with empty faces", () => {
    expect(kinds(pullRequests(3), 5)).toEqual(["pr", "pr", "pr", "empty", "empty"]);
  });

  test("shows every pull request when they fit exactly", () => {
    expect(kinds(pullRequests(5), 5)).toEqual(["pr", "pr", "pr", "pr", "pr"]);
  });

  test("the last slot counts the pull requests that do not fit", () => {
    const contents = slotContents(pullRequests(6), 5, 6);

    expect(contents.map((content) => content.kind)).toEqual(["pr", "pr", "pr", "pr", "overflow"]);
    expect(contents[4]).toEqual({ kind: "overflow", count: 2 });
  });

  test("a single slot shows the overflow", () => {
    expect(slotContents(pullRequests(2), 1, 2)).toEqual([{ kind: "overflow", count: 2 }]);
  });

  test("the overflow counts the pull requests past the first 100", () => {
    expect(slotContents(pullRequests(100), 5, 120)[4]).toEqual({ kind: "overflow", count: 116 });
  });

  test("zero slots show nothing", () => {
    expect(slotContents(pullRequests(2), 0, 2)).toEqual([]);
  });
});
