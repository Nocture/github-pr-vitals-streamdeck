import { afterEach, beforeEach, expect, type Mock, test, vi } from "vitest";
import type { KeyUpEvent, WillAppearEvent } from "@elgato/streamdeck";
import { SVG_DATA_PREFIX } from "../face/svg";
import { GITHUB_API_URL } from "../github/rest";
import { POLL_INTERVAL_MS } from "../poller";
import { APPEAR_SETTLE_MS, PrStatus } from "../pr-status";
import { APPROVED_PRS_URL } from "../prs/slots";
import type { KeySettings } from "../settings";
import { createKey, type FakeKey, githubFetch, json, prNode, searchBody, type SearchFetch, stage, streamDeckMock, svgTexts } from "../test-support";
import { DeploySlotAction } from "./deploy-slot";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);

const { openUrl } = streamDeckMock.default.system;

const SETTINGS = { githubToken: "ghp_test", jiraSite: "https://example.atlassian.net", jiraProjects: "ABC, XYZ" };
const DEPLOY_SLOT_ID = "com.nocture.prvitals.deploy-slot";

const behind = prNode({ reviewDecision: "APPROVED" });
const inReview = prNode({
  number: 9871,
  title: "XYZ-417 Search result sorting",
  headRefName: "XYZ-417-search-sorting",
  url: "https://github.com/acme/billing/pull/9871",
  createdAt: "2026-11-09T10:00:00Z",
});
const ready = prNode({
  number: 9764,
  title: "ABC-20388 Export to CSV",
  headRefName: "ABC-20388-export-to-csv",
  url: "https://github.com/acme/billing/pull/9764",
  createdAt: "2026-11-02T10:00:00Z",
  reviewDecision: "APPROVED",
  mergeStateStatus: "CLEAN",
  statusCheckRollup: {
    state: "SUCCESS",
    contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 10 }], statusContextCountsByState: [] },
  },
});
const conflicting = prNode({
  number: 9655,
  title: "XYZ-305 Currency rates",
  headRefName: "XYZ-305-currency-rates",
  url: "https://github.com/acme/billing/pull/9655",
  createdAt: "2026-11-01T10:00:00Z",
  reviewDecision: "APPROVED",
  mergeStateStatus: "DIRTY",
});

let pullRequests: object[];
let fetchSpy: Mock<SearchFetch>;
let slot: DeploySlotAction;

// Resolves when the plugin has read the global settings.
function startPlugin(): Promise<void> {
  const status = new PrStatus();
  slot = new DeploySlotAction(status);
  return status.start();
}

function appear(column: number): FakeKey {
  const key = createKey({ deviceId: "deck-1", row: 0, column }, `column-${column}`, { manifestId: DEPLOY_SLOT_ID });
  stage.keys = [...stage.keys, key];
  void slot.onWillAppear({ action: key } as unknown as WillAppearEvent<KeySettings>);
  return key;
}

// Lets the poll and the redraws after it finish.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(APPEAR_SETTLE_MS);
}

function shown(key: FakeKey): string[] {
  const image = key.setImage.mock.lastCall?.[0] ?? "";
  return svgTexts(decodeURIComponent(image.slice(SVG_DATA_PREFIX.length)));
}

// A press is a key up. The key down does nothing.
function press(key: FakeKey): Promise<void> {
  return slot.onKeyUp({ action: key } as unknown as KeyUpEvent<KeySettings>);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stage.keys = [];
  stage.globalSettings = SETTINGS;
  pullRequests = [behind, inReview, ready];
  fetchSpy = vi.fn<SearchFetch>(async (url: string) =>
    url.startsWith(`${GITHUB_API_URL}/repos/`) ? json(200, { default_branch: "main" }) : json(200, searchBody(pullRequests)),
  );
  vi.stubGlobal("fetch", githubFetch(fetchSpy));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("fills the keys with approved PRs, ready first", async () => {
  await startPlugin();
  const first = appear(0);
  const second = appear(1);
  const third = appear(2);
  await settle();
  expect(shown(first)[0]).toBe("ABC-20388");
  expect(shown(second)[0]).toBe("ABC-20415");
  expect(shown(third)).toEqual(["No PR"]);
});

test("with nothing approved the first key says so and opens the approved PRs", async () => {
  pullRequests = [inReview];
  await startPlugin();
  const first = appear(0);
  const next = appear(1);
  await settle();
  expect(shown(first)).toEqual(["Nothing", "approved yet"]);
  expect(shown(next)).toEqual(["No PR"]);
  await press(first);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(APPROVED_PRS_URL);
});

test("offline with nothing approved, the first key says there is no data", async () => {
  pullRequests = [inReview];
  await startPlugin();
  const first = appear(0);
  await settle();
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(shown(first)).toEqual(["No data", "offline 1m"]);
});

test("the last key counts the approved PRs that do not fit and opens them", async () => {
  pullRequests = [behind, inReview, ready, conflicting];
  await startPlugin();
  appear(0);
  const last = appear(1);
  await settle();
  expect(shown(last)).toEqual(["+2", "more PRs", "on GitHub"]);
  await press(last);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(APPROVED_PRS_URL);
});

test("a press opens the PR, and a second press within 3 s opens its Jira ticket", async () => {
  pullRequests = [ready];
  await startPlugin();
  const key = appear(0);
  await settle();
  await press(key);
  await press(key);
  expect(openUrl.mock.calls).toEqual([
    ["https://github.com/acme/billing/pull/9764"],
    ["https://example.atlassian.net/browse/ABC-20388"],
  ]);
});
