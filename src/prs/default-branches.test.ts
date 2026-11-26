import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_BRANCH_RETRY_MS, DefaultBranches } from "./default-branches";
import { deployList } from "./deploy";
import { fetchDefaultBranch } from "../github/rest";
import { pullRequest, streamDeckMock } from "../test-support";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);
vi.mock("../github/rest", () => ({ fetchDefaultBranch: vi.fn() }));

const lookup = vi.mocked(fetchDefaultBranch);
const BILLING = { owner: "acme", repo: "billing" };
let branches: DefaultBranches;

beforeEach(() => {
  lookup.mockReset();
  branches = new DefaultBranches();
});

afterEach(() => vi.clearAllMocks());

test("asks once per repo", async () => {
  lookup.mockResolvedValue("master");
  expect(await branches.load("token", [BILLING, BILLING], 0)).toBe(true);
  expect(await branches.load("token", [BILLING], 1)).toBe(false);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(branches.branchOf(BILLING.owner, BILLING.repo)).toBe("master");
});

test("a repo whose default branch cannot be read counts main and master", async () => {
  lookup.mockRejectedValue(new Error("Forbidden"));
  expect(await branches.load("token", [BILLING], 0)).toBe(false);
  expect(branches.branchOf(BILLING.owner, BILLING.repo)).toBeUndefined();
  const pr = pullRequest({ reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", baseRefName: "master" });
  expect(deployList([pr], () => branches.branchOf(pr.owner, pr.repository))).toEqual([pr]);
});

test("tries a failed repo again after an hour", async () => {
  lookup.mockRejectedValueOnce(new Error("Forbidden")).mockResolvedValue("master");
  await branches.load("token", [BILLING], 0);
  await branches.load("token", [BILLING], DEFAULT_BRANCH_RETRY_MS - 1);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(await branches.load("token", [BILLING], DEFAULT_BRANCH_RETRY_MS)).toBe(true);
  expect(branches.branchOf(BILLING.owner, BILLING.repo)).toBe("master");
});

test("a new token forgets the known branches", async () => {
  lookup.mockResolvedValue("master");
  await branches.load("first", [BILLING], 0);
  branches.useToken("second");
  expect(branches.branchOf(BILLING.owner, BILLING.repo)).toBeUndefined();
});

test("two overlapping loads look up a repo once", async () => {
  lookup.mockResolvedValue("master");
  await Promise.all([branches.load("token", [BILLING], 0), branches.load("token", [BILLING], 1)]);
  expect(lookup).toHaveBeenCalledTimes(1);
});

test("a lookup that ends after a token change stores nothing", async () => {
  let finish: (branch: string) => void = () => {};
  lookup.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const loading = branches.load("first", [BILLING], 0);
  branches.useToken("second");
  finish("master");
  expect(await loading).toBe(false);
  expect(branches.branchOf(BILLING.owner, BILLING.repo)).toBeUndefined();
});

test("a failed lookup logs a warning without the token", async () => {
  lookup.mockRejectedValue(new Error("Forbidden"));
  await branches.load("ghp_secret", [BILLING], 0);
  expect(streamDeckMock.default.logger.warn).toHaveBeenCalledWith(
    "Default branch lookup failed for acme/billing: Forbidden",
  );
});
