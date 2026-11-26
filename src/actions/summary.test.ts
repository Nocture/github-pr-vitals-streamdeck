import { afterEach, beforeEach, expect, type Mock, test, vi } from "vitest";
import { DeviceType } from "@elgato/streamdeck";
import type { KeyUpEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import { BUILD_LABEL } from "../build";
import { SVG_DATA_PREFIX } from "../face/svg";
import { FRAME_MS } from "../frame-timer";
import { GITHUB_API_URL } from "../github/rest";
import { TOKEN_PAGE_URL } from "../github/token-pages";
import { POLL_INTERVAL_MS } from "../poller";
import { APPEAR_SETTLE_MS, PrStatus } from "../pr-status";
import type { ListKind } from "../profiles";
import { PULSE_MS } from "../prs/failure-clock";
import type { PropertyInspectorRequest } from "../property-inspector";
import type { KeySettings } from "../settings";
import { createKey, type FakeKey, githubFetch, json, prNode, searchBody, type SearchFetch, stage, streamDeckMock, svgTexts } from "../test-support";
import { SummaryDeployAction, SummaryMineAction } from "./summary";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);

const { onSystemDidWakeUp, openUrl } = streamDeckMock.default.system;
const { switchToProfile } = streamDeckMock.default.profiles;
const { info } = streamDeckMock.default.logger;
const { sendToPropertyInspector } = streamDeckMock.default.ui;

const SETTINGS = { githubToken: "ghp_test" };
const SUMMARY_IDS: Record<ListKind, string> = {
  mine: "com.nocture.prvitals.summary-mine",
  deploy: "com.nocture.prvitals.summary-deploy",
};
const TOP_LEFT = { deviceId: "deck-1", row: 0, column: 0 };
const MINUTE_MS = 60_000;

const running = prNode();
const failing = prNode({
  number: 9871,
  statusCheckRollup: {
    state: "FAILURE",
    contexts: { checkRunCountsByState: [{ state: "FAILURE", count: 1 }], statusContextCountsByState: [] },
  },
});
const passed = prNode({
  number: 9871,
  statusCheckRollup: {
    state: "SUCCESS",
    contexts: { checkRunCountsByState: [{ state: "SUCCESS", count: 1 }], statusContextCountsByState: [] },
  },
});

let pullRequests: object[];
let fetchSpy: Mock<SearchFetch>;
let status: PrStatus;
let summaries: Record<ListKind, SummaryMineAction | SummaryDeployAction>;

// Resolves when the plugin has read the global settings.
function startPlugin(): Promise<void> {
  status = new PrStatus();
  summaries = { mine: new SummaryMineAction(status), deploy: new SummaryDeployAction(status) };
  return status.start();
}

function appear(list: ListKind, deviceType: number = DeviceType.StreamDeckXL): FakeKey {
  const key = createKey(TOP_LEFT, list, { manifestId: SUMMARY_IDS[list], deviceType });
  stage.keys = [...stage.keys, key];
  void summaries[list].onWillAppear({ action: key } as unknown as WillAppearEvent<KeySettings>);
  return key;
}

function press(list: ListKind, key: FakeKey): Promise<void> {
  return summaries[list].onKeyUp({ action: key } as unknown as KeyUpEvent<KeySettings>);
}

// Lets the poll and the redraws after it finish.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(APPEAR_SETTLE_MS);
}

function lastSvg(key: FakeKey): string {
  const image = key.setImage.mock.lastCall?.[0] ?? "";
  return decodeURIComponent(image.slice(SVG_DATA_PREFIX.length));
}

function shown(key: FakeKey): string[] {
  return svgTexts(lastSvg(key));
}

function backgroundColor(key: FakeKey): string | undefined {
  return lastSvg(key).match(/<rect [^>]*fill="(#[0-9a-f]{6})"/)?.[1];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stage.keys = [];
  stage.globalSettings = SETTINGS;
  pullRequests = [running, failing];
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

test("shows the My PRs summary in the chosen style", async () => {
  stage.globalSettings = { ...SETTINGS, mineStyle: "ledger" };
  await startPlugin();
  const key = appear("mine");
  await settle();
  expect(shown(key)).toEqual(["My PRs", "2", "1", "failing", "1", "running"]);
});

test("a My PRs key without a style setting shows the Scoreboard", async () => {
  await startPlugin();
  const key = appear("mine");
  await settle();
  expect(shown(key)).toEqual(["My PRs", "2", "1", "0", "1"]);
});

test("a Deploy key without a style setting shows Signal", async () => {
  pullRequests = [running];
  await startPlugin();
  const key = appear("deploy");
  await settle();
  expect(shown(key)).toEqual(["Deploy", "0", "approved"]);
});

test("an unknown style falls back to each key's own default", async () => {
  stage.globalSettings = { ...SETTINGS, mineStyle: "neon", deployStyle: "neon" };
  pullRequests = [running];
  await startPlugin();
  const mineKey = appear("mine");
  const deployKey = appear("deploy");
  await settle();
  expect(shown(mineKey)).toEqual(["My PRs", "1", "0", "0", "1"]);
  expect(shown(deployKey)).toEqual(["Deploy", "0", "approved"]);
});

test("a press switches the XL to the PR Vitals profile", async () => {
  await startPlugin();
  const mine = appear("mine");
  const deploy = appear("deploy");
  await settle();
  await press("mine", mine);
  await press("deploy", deploy);
  expect(switchToProfile.mock.calls).toEqual([
    ["deck-1", "profiles/PR Vitals XL"],
    ["deck-1", "profiles/PR Deploy XL"],
  ]);
});

test("a press on a Mini switches to its own profile", async () => {
  await startPlugin();
  const key = appear("mine", DeviceType.StreamDeckMini);
  await settle();
  await press("mine", key);
  expect(switchToProfile.mock.calls).toEqual([["deck-1", "profiles/PR Vitals Mini"]]);
});

test("a press on a deck without a bundled profile switches nothing", async () => {
  await startPlugin();
  const key = appear("mine", DeviceType.StreamDeckMobile);
  await settle();
  await press("mine", key);
  expect(switchToProfile).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith("No bundled profile for device type 3");
});

test("without a token the summary key asks for one and its press opens the token page", async () => {
  stage.globalSettings = {};
  await startPlugin();
  const key = appear("mine");
  await settle();
  expect(shown(key)).toEqual(["My PRs", "Add a", "token"]);
  await press("mine", key);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(TOKEN_PAGE_URL);
  expect(switchToProfile).not.toHaveBeenCalled();
});

test("an offline summary dims the last face and says how old it is", async () => {
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0));
  stage.globalSettings = { ...SETTINGS, mineStyle: "signal" };
  await startPlugin();
  const key = appear("mine");
  await settle();
  fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
  await vi.advanceTimersByTimeAsync(4 * MINUTE_MS);
  const [wakeUpListener] = onSystemDidWakeUp.mock.lastCall ?? [];
  wakeUpListener();
  await settle();
  const offline = lastSvg(key);
  expect(offline).toContain('<g opacity="0.4">');
  expect(shown(key)).toEqual(["My PRs", "2", "1", "failing", "1", "My PRs", "offline 4m"]);
  // The failing count blinks on a live face, but a stale face stays still.
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  expect(lastSvg(key)).toBe(offline);
});

test("a rate-limited summary says until when it is paused", async () => {
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0));
  await startPlugin();
  const key = appear("mine");
  await settle();
  const resetSeconds = new Date(2026, 10, 25, 14, 5).getTime() / 1000;
  fetchSpy.mockResolvedValue(
    json(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, { "x-ratelimit-reset": String(resetSeconds) }),
  );
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(shown(key).at(-1)).toBe("until 14:05");
});

test("blinks while a counted PR fails", async () => {
  stage.globalSettings = { ...SETTINGS, mineStyle: "signal" };
  await startPlugin();
  const key = appear("mine");
  await settle();
  const colors = [backgroundColor(key)];
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  colors.push(backgroundColor(key));
  // An odd frame after the 5 minutes that a PR key pulses.
  await vi.advanceTimersByTimeAsync(PULSE_MS);
  colors.push(backgroundColor(key));
  expect(colors).toEqual(["#d0312a", "#8f1d16", "#8f1d16"]);
});

test("a calm summary key is not painted again while the other one blinks", async () => {
  await startPlugin();
  const mine = appear("mine");
  const deploy = appear("deploy");
  await settle();
  mine.setImage.mockClear();
  deploy.setImage.mockClear();
  await vi.advanceTimersByTimeAsync(2 * FRAME_MS);
  expect(mine.setImage).toHaveBeenCalledTimes(2);
  expect(deploy.setImage).not.toHaveBeenCalled();
});

test("the frame timer stops once the failing PR passes", async () => {
  pullRequests = [failing];
  await startPlugin();
  appear("mine");
  await settle();
  pullRequests = [passed];
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  const frameWhenPassed = status.frame;
  expect(frameWhenPassed).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(2 * FRAME_MS);
  expect(status.frame).toBe(frameWhenPassed);
});

test("answers the settings page", async () => {
  await startPlugin();
  const request: PropertyInspectorRequest = { event: "getBuild" };
  await summaries.mine.onSendToPlugin({ payload: request } as unknown as SendToPluginEvent<PropertyInspectorRequest, KeySettings>);
  expect(sendToPropertyInspector).toHaveBeenCalledExactlyOnceWith({ event: "build", label: BUILD_LABEL });
});
