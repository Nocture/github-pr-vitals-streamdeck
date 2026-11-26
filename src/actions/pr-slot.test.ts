import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import type { KeyDownEvent, KeyUpEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { BUILD_LABEL } from "../build";
import { SVG_DATA_PREFIX } from "../face/svg";
import { FRAME_MS } from "../frame-timer";
import { SSO_PAGE_URL, TOKEN_PAGE_URL } from "../github/token-pages";
import { POLL_INTERVAL_MS } from "../poller";
import { APPEAR_SETTLE_MS, PrStatus } from "../pr-status";
import { PULSE_MS } from "../prs/failure-clock";
import { MORE_PRS_URL } from "../prs/slots";
import type { PropertyInspectorRequest } from "../property-inspector";
import type { KeySettings } from "../settings";
import { createKey, type FakeKey, githubFetch, json, type KeyPosition, prNode, searchBody, type SearchFetch, stage, streamDeckMock, svgTexts } from "../test-support";
import { PrSlotAction } from "./pr-slot";
import { JIRA_WINDOW_MS } from "./slot-action";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);

const { onSystemDidWakeUp, openUrl } = streamDeckMock.default.system;
const { getGlobalSettings, onDidReceiveGlobalSettings } = streamDeckMock.default.settings;
const { sendToPropertyInspector } = streamDeckMock.default.ui;

const SETTINGS = { githubToken: "ghp_test", jiraSite: "https://example.atlassian.net", jiraProjects: "ABC, XYZ" };
const MINUTE_MS = 60_000;
const NEWEST_URL = "https://github.com/acme/billing/pull/10342";
const NEWEST_JIRA_URL = "https://example.atlassian.net/browse/ABC-20415";

const newest = prNode({ createdAt: "2026-11-11T10:00:00Z" });
const second = prNode({
  number: 9871,
  title: "XYZ-417 Search result sorting",
  headRefName: "XYZ-417-search-sorting",
  url: "https://github.com/acme/billing/pull/9871",
  createdAt: "2026-11-09T10:00:00Z",
});
const failing = prNode({
  statusCheckRollup: {
    state: "FAILURE",
    contexts: { checkRunCountsByState: [{ state: "FAILURE", count: 1 }], statusContextCountsByState: [] },
  },
});
const oldest = prNode({
  number: 9764,
  title: "ABC-20388 Export to CSV",
  headRefName: "ABC-20388-export-to-csv",
  url: "https://github.com/acme/billing/pull/9764",
  createdAt: "2026-11-02T10:00:00Z",
});

let pullRequests: object[];
let fetchSpy: Mock<SearchFetch>;
let slot: PrSlotAction;

// Resolves when the plugin has read the global settings.
function startPlugin(): Promise<void> {
  const status = new PrStatus();
  slot = new PrSlotAction(status);
  return status.start();
}

function at(row: number, column: number): KeyPosition {
  return { deviceId: "deck-1", row, column };
}

function appear(position: KeyPosition | null, name: string): FakeKey {
  const key = createKey(position, name);
  stage.keys = [...stage.keys, key];
  void slot.onWillAppear({ action: key, payload: { settings: {} } } as unknown as WillAppearEvent<KeySettings>);
  return key;
}

function disappear(key: FakeKey): void {
  stage.keys = stage.keys.filter((shownKey) => shownKey !== key);
  void slot.onWillDisappear({ action: key } as unknown as WillDisappearEvent<KeySettings>);
}

// Lets the poll and the redraws after it finish.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(APPEAR_SETTLE_MS);
}

// The SVG of the last image that the key got.
function lastSvg(key: FakeKey): string {
  const image = key.setImage.mock.lastCall?.[0] ?? "";
  return decodeURIComponent(image.slice(SVG_DATA_PREFIX.length));
}

function shown(key: FakeKey): string[] {
  return svgTexts(lastSvg(key));
}

function bandColor(key: FakeKey): string | undefined {
  return lastSvg(key).match(/<rect x="0" y="0" width="144" height="25" fill="(#[0-9a-f]{6})"/)?.[1];
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
  pullRequests = [newest];
  fetchSpy = vi.fn<SearchFetch>(async () => json(200, searchBody(pullRequests)));
  vi.stubGlobal("fetch", githubFetch(fetchSpy));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("fills the keys with the newest pull requests in key order", async () => {
  pullRequests = [second, newest];
  await startPlugin();
  const right = appear(at(0, 2), "right");
  const left = appear(at(0, 0), "left");
  const below = appear(at(1, 0), "below");
  await settle();
  expect(shown(left)[0]).toBe("ABC-20415");
  expect(shown(right)[0]).toBe("XYZ-417");
  expect(shown(below)).toEqual(["No PR"]);
});

test("a key whose image fails does not stop the other keys", async () => {
  pullRequests = [second, newest];
  await startPlugin();
  const first = appear(at(0, 0), "first");
  const next = appear(at(0, 1), "next");
  first.setImage.mockRejectedValue(new Error("Stream Deck is not connected"));
  await settle();
  expect(shown(next)[0]).toBe("XYZ-417");
});

test("a key in a multi-action takes no slot", async () => {
  pullRequests = [second, newest];
  await startPlugin();
  const inMultiAction = appear(null, "multi-action");
  const first = appear(at(0, 0), "first");
  const next = appear(at(0, 1), "next");
  await settle();
  expect(inMultiAction.setImage).not.toHaveBeenCalled();
  expect(shown(first)[0]).toBe("ABC-20415");
  expect(shown(next)[0]).toBe("XYZ-417");
});

test("a key that disappears gives its slot to the next key", async () => {
  await startPlugin();
  const first = appear(at(0, 0), "first");
  const next = appear(at(0, 1), "next");
  await settle();
  disappear(first);
  await settle();
  expect(shown(next)[0]).toBe("ABC-20415");
});

test("polling stops when the last key disappears", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  disappear(key);
  await vi.advanceTimersByTimeAsync(3 * POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("a pull request that fails pulses, then stays solid after 5 minutes", async () => {
  pullRequests = [failing];
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  const bandColors = [bandColor(key)];
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  bandColors.push(bandColor(key));
  // An odd frame: a band that still pulsed would be dim here.
  await vi.advanceTimersByTimeAsync(PULSE_MS);
  bandColors.push(bandColor(key));
  expect(bandColors).toEqual(["#d0312a", "#8f1d16", "#d0312a"]);
});

test("a pull request with conflicts flashes its word between frames", async () => {
  pullRequests = [prNode({ mergeStateStatus: "DIRTY" })];
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  const frameZero = lastSvg(key);
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  expect(lastSvg(key)).not.toBe(frameZero);
  expect(lastSvg(key)).toContain('fill="#ff7ae0">conflicts<');
});

test("the last key counts the pull requests that do not fit", async () => {
  pullRequests = [oldest, second, newest];
  await startPlugin();
  appear(at(0, 0), "first");
  const last = appear(at(0, 1), "last");
  await settle();
  expect(shown(last)).toEqual(["+2", "more PRs", "on GitHub"]);
});

test("a press on the last key opens all open pull requests on GitHub", async () => {
  pullRequests = [oldest, second, newest];
  await startPlugin();
  appear(at(0, 0), "first");
  const last = appear(at(0, 1), "last");
  await settle();
  await press(last);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(MORE_PRS_URL);
});

test("a press opens the pull request and shows its Jira face", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(NEWEST_URL);
  expect(shown(key)).toEqual(["Press again", "to open JIRA", "3s"]);
});

test("a press opens the pull request even when the key image fails", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  key.setImage.mockRejectedValue(new Error("Stream Deck is not connected"));
  await settle();
  await press(key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(NEWEST_URL);
});

test("a second press within 3 s opens the Jira ticket and shows the pull request again", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  await vi.advanceTimersByTimeAsync(JIRA_WINDOW_MS - 1);
  await press(key);
  expect(openUrl.mock.calls).toEqual([[NEWEST_URL], [NEWEST_JIRA_URL]]);
  expect(shown(key)).toEqual(expect.arrayContaining(["ABC-20415", "billing"]));
});

test("the Jira face counts down the seconds left while the keys redraw", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  // The pipeline of the pull request runs, so the keys redraw every frame.
  await vi.advanceTimersByTimeAsync(2 * FRAME_MS);
  expect(shown(key)).toEqual(["Press again", "to open JIRA", "2s"]);
  await vi.advanceTimersByTimeAsync(2 * FRAME_MS);
  expect(shown(key)).toEqual(["Press again", "to open JIRA", "1s"]);
});

test("after 3 s the key shows its pull request again, and the next press opens the pull request", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  await vi.advanceTimersByTimeAsync(JIRA_WINDOW_MS);
  expect(shown(key)).toEqual(expect.arrayContaining(["ABC-20415", "billing"]));
  await press(key);
  expect(openUrl.mock.calls).toEqual([[NEWEST_URL], [NEWEST_URL]]);
  expect(shown(key)).toContain("Press again");
});

test("a second press on a pull request without a ticket opens nothing", async () => {
  pullRequests = [prNode({ title: "Bump the test runner", headRefName: "bump-test-runner" })];
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  expect(shown(key)).toEqual(["No JIRA", "ticket", "3s"]);
  await press(key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(NEWEST_URL);
});

test("without a Jira site the key asks for the site, and a second press opens nothing", async () => {
  stage.globalSettings = { ...SETTINGS, jiraSite: "" };
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  await press(key);
  expect(shown(key)).toEqual(["Set the", "JIRA site", "3s"]);
  await press(key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(NEWEST_URL);
});

test("a second press opens the ticket of the first press, even when the slot shows another pull request by then", async () => {
  pullRequests = [second];
  await startPlugin();
  const key = appear(at(0, 0), "first");
  appear(at(0, 1), "next");
  await settle();
  await press(key);
  pullRequests = [second, newest];
  const [wakeUpListener] = onSystemDidWakeUp.mock.lastCall ?? [];
  wakeUpListener();
  await settle();
  await press(key);
  expect(openUrl.mock.calls).toEqual([
    ["https://github.com/acme/billing/pull/9871"],
    ["https://example.atlassian.net/browse/XYZ-417"],
  ]);
  expect(shown(key)[0]).toBe("ABC-20415");
});

test("a key held for 1 s and released is one press", async () => {
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  slot.onKeyDown?.({ action: key } as unknown as KeyDownEvent<KeySettings>);
  await vi.advanceTimersByTimeAsync(1_000);
  await press(key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(NEWEST_URL);
});

test("without a token the first key asks for one and opens the token page", async () => {
  stage.globalSettings = {};
  await startPlugin();
  const first = appear(at(0, 0), "first");
  const next = appear(at(0, 1), "next");
  await settle();
  expect(shown(first)).toEqual(["Add a", "token", "press to fix"]);
  expect(shown(next)).toEqual(["No PR"]);
  await press(first);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(TOKEN_PAGE_URL);
});

test("offline before any answer, the first key says there is no data and opens nothing", async () => {
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
  await startPlugin();
  const first = appear(at(0, 0), "first");
  const next = appear(at(0, 1), "next");
  await settle();
  expect(shown(first)).toEqual(["No data", "offline"]);
  expect(shown(next)).toEqual(["No PR"]);
  await press(first);
  expect(openUrl).not.toHaveBeenCalled();
});

test("the offline age counts from the last good update", async () => {
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0));
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
  await vi.advanceTimersByTimeAsync(4 * MINUTE_MS);
  const [wakeUpListener] = onSystemDidWakeUp.mock.lastCall ?? [];
  wakeUpListener();
  await settle();
  expect(shown(key)).toEqual(expect.arrayContaining(["ABC-20415", "offline 4m"]));
});

test("a rate-limited key says until when it is paused", async () => {
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0));
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  const resetSeconds = new Date(2026, 10, 25, 14, 5).getTime() / 1000;
  fetchSpy.mockResolvedValue(
    json(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, { "x-ratelimit-reset": String(resetSeconds) }),
  );
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(shown(key)).toEqual(expect.arrayContaining(["ABC-20415", "paused to 14:05"]));
});

describe("a token problem", () => {
  test("an expired token asks for a new one on the first key", async () => {
    fetchSpy.mockResolvedValue(json(401, { message: "Bad credentials" }));
    await startPlugin();
    const first = appear(at(0, 0), "first");
    const next = appear(at(0, 1), "next");
    await settle();
    expect(shown(first)).toEqual(["Token", "expired", "press to fix"]);
    expect(shown(next)).toEqual(["No PR"]);
    await press(first);
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(TOKEN_PAGE_URL);
  });

  test("an SSO problem opens the token list to authorise it", async () => {
    fetchSpy.mockResolvedValue(json(403, { message: "Resource protected by organization SAML enforcement" }));
    await startPlugin();
    const first = appear(at(0, 0), "first");
    await settle();
    expect(shown(first)).toEqual(["Token", "needs SSO", "press to fix"]);
    await press(first);
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(SSO_PAGE_URL);
  });

  test("a token without access opens the token page", async () => {
    fetchSpy.mockResolvedValue(json(403, { message: "Resource not accessible by personal access token" }));
    await startPlugin();
    const first = appear(at(0, 0), "first");
    await settle();
    expect(shown(first)).toEqual(["Token", "no access", "press to fix"]);
    await press(first);
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(TOKEN_PAGE_URL);
  });
});

test("before the settings load, no key asks for a token", async () => {
  getGlobalSettings.mockReturnValueOnce(new Promise(() => {}));
  void startPlugin();
  const first = appear(at(0, 0), "first");
  await settle();
  expect(shown(first)).toEqual(["No PR"]);
});

test("a token added in the settings fills the keys", async () => {
  stage.globalSettings = {};
  await startPlugin();
  const key = appear(at(0, 0), "first");
  await settle();
  const [listener] = onDidReceiveGlobalSettings.mock.lastCall ?? [];
  listener({ settings: SETTINGS });
  await settle();
  expect(shown(key)[0]).toBe("ABC-20415");
});

test("while no key is visible, neither the start nor a wake-up calls GitHub", async () => {
  await startPlugin();
  const [wakeUpListener] = onSystemDidWakeUp.mock.lastCall ?? [];
  wakeUpListener();
  await settle();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers the settings page", async () => {
  await startPlugin();
  const request: PropertyInspectorRequest = { event: "getBuild" };
  await slot.onSendToPlugin({ payload: request } as unknown as SendToPluginEvent<PropertyInspectorRequest, KeySettings>);
  expect(sendToPropertyInspector).toHaveBeenCalledExactlyOnceWith({ event: "build", label: BUILD_LABEL });
});
