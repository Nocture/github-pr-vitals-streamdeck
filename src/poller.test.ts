import { afterEach, beforeEach, expect, type Mock, test, vi } from "vitest";
import { GitHubRateLimitError, GitHubSsoError } from "./github/client";
import { POLL_INTERVAL_MS, Poller } from "./poller";
import { githubTokenOf } from "./settings";
import { githubFetch, json, prNode, searchBody, type SearchFetch, streamDeckMock } from "./test-support";

vi.mock("@elgato/streamdeck", async () => (await import("./test-support")).streamDeckMock);

const warn = streamDeckMock.default.logger.warn;
const TOKEN = "ghp_secret";

let fetchSpy: Mock<SearchFetch>;
let onChange: Mock<() => void>;
let poller: Poller;

beforeEach(() => {
  vi.useFakeTimers();
  warn.mockClear();
  fetchSpy = vi.fn<SearchFetch>(async () => json(200, searchBody([prNode()], 1)));
  vi.stubGlobal("fetch", githubFetch(fetchSpy));
  onChange = vi.fn<() => void>();
  poller = new Poller(onChange);
  poller.setVisible(true);
});

afterEach(() => {
  poller.setVisible(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("polls at once when a key appears, then every 60 s while keys are visible", async () => {
  poller.setVisible(false);
  poller.setToken(TOKEN);
  poller.setVisible(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test("stops polling while no key is visible", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setVisible(false);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("a failed request keeps the pull requests and marks them offline", async () => {
  poller.setToken(TOKEN);
  await poller.pollNow();
  const answered = poller.snapshot;
  if (answered.kind !== "ready") throw new Error("expected a ready snapshot");
  await vi.advanceTimersByTimeAsync(5_000);
  fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
  await poller.pollNow();
  expect(poller.snapshot).toEqual({ ...answered, issue: { kind: "offline" } });
  expect(warn).toHaveBeenCalledWith("GitHub poll failed: fetch failed");
});

test("a good poll after a failed one clears the issue", async () => {
  poller.setToken(TOKEN);
  await poller.pollNow();
  fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
  await poller.pollNow();
  await poller.pollNow();
  expect(poller.snapshot).toMatchObject({ kind: "ready", issue: null });
});

test("before any answer, a failure keeps waiting and marks it offline", async () => {
  fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: { kind: "offline" } });
});

test("a successful poll stores the time of its answer", async () => {
  vi.setSystemTime(1_700_000_000_000);
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toMatchObject({ kind: "ready", updatedMs: 1_700_000_000_000, issue: null });
});

test("a rate limit pauses polling until the reset, then polls at once", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() + 150_000));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toMatchObject({ kind: "waiting", issue: { kind: "rateLimited" } });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(poller.snapshot).toMatchObject({ kind: "ready", issue: null });
});

test("a reset time in the past polls at the next interval", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() - 10_000));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("a rate limit with a reset in the past keeps the previous issue", async () => {
  poller.setToken(TOKEN);
  await poller.pollNow();
  fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
  await poller.pollNow();
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() - 10_000));
  await poller.pollNow();
  expect(poller.snapshot).toMatchObject({ kind: "ready", issue: { kind: "offline" } });
});

test("a new token clears the rate limit pause", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() + 150_000));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setToken("ghp_other");
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("a rate limit pause that ends while no key is visible polls when a key returns", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() + 150_000));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setVisible(false);
  await vi.advanceTimersByTimeAsync(100_000);
  poller.setVisible(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(50_000);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("a rate limit pause that ended while no key was visible sends one poll when a key returns", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubRateLimitError(Date.now() + 150_000));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setVisible(false);
  await vi.advanceTimersByTimeAsync(200_000);
  poller.setVisible(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("a refused token keeps being tried and recovers by itself", async () => {
  fetchSpy.mockResolvedValueOnce(json(401, { message: "Bad credentials" }));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "tokenProblem", problem: "expired" });
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(poller.snapshot).toMatchObject({ kind: "ready", issue: null });
});

test("an SSO refusal is its own token problem", async () => {
  fetchSpy.mockRejectedValueOnce(new GitHubSsoError());
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "tokenProblem", problem: "sso" });
});

test("a permission refusal is a token problem that keeps being tried", async () => {
  fetchSpy.mockResolvedValueOnce(json(403, { message: "Resource not accessible by personal access token" }));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "tokenProblem", problem: "noAccess" });
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(poller.snapshot).toMatchObject({ kind: "ready", issue: null });
});

test("a network failure after a refusal keeps the token problem", async () => {
  poller.setToken(TOKEN);
  await poller.pollNow();
  fetchSpy.mockRejectedValueOnce(new GitHubSsoError());
  await poller.pollNow();
  fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
  await poller.pollNow();
  expect(poller.snapshot).toEqual({ kind: "tokenProblem", problem: "sso" });
});

test("an error in the change callback is not a failed poll", async () => {
  poller.setToken(TOKEN);
  onChange.mockImplementationOnce(() => {
    throw new Error("boom");
  });
  await vi.advanceTimersByTimeAsync(0);
  const messages = warn.mock.calls.map(([message]) => String(message));
  expect(messages.some((message) => message.startsWith("GitHub poll failed"))).toBe(false);
  expect(messages).toContain("PR Vitals redraw failed: boom");
  expect(poller.snapshot).toMatchObject({ kind: "ready" });
});

test("a skipped poll does not tell the owner", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setVisible(false);
  onChange.mockClear();
  await poller.pollNow();
  expect(onChange).not.toHaveBeenCalled();
});

test("a malformed response is a failed poll, not an unhandled rejection", async () => {
  fetchSpy.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: { kind: "offline" } });
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a new token while no key is visible does not call GitHub", async () => {
  poller.setVisible(false);
  poller.setToken(TOKEN);
  await poller.pollNow();
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: null });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("without a token it does not call GitHub", async () => {
  poller.setToken(null);
  await poller.pollNow();
  expect(poller.snapshot).toEqual({ kind: "noToken" });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a new token polls at once", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setToken("ghp_other");
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("the same token does not poll again", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test.each([TOKEN, `${TOKEN}\u0000`])("the warning of a failed poll holds no token: %j", async (savedToken) => {
  fetchSpy.mockImplementationOnce(async (_url: string, init: RequestInit) => {
    // Node's fetch checks the headers this way. Its error holds an invalid header value.
    new Headers(init.headers);
    return json(401, { message: "Bad credentials" });
  });
  poller.setToken(githubTokenOf({ githubToken: savedToken }));
  await poller.pollNow();
  expect(warn).toHaveBeenCalled();
  expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
});

test("a request during a poll runs once after it", async () => {
  let release: () => void = () => {};
  fetchSpy.mockImplementationOnce(
    () => new Promise((resolve) => (release = () => resolve(json(200, searchBody([prNode()], 1))))),
  );
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  const second = poller.pollNow();
  const third = poller.pollNow();
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([second, third]);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("tells the owner after a successful poll and after the snapshot kind changes", async () => {
  poller.setToken(TOKEN);
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: null });
  expect(onChange).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toMatchObject({ kind: "ready" });
  expect(onChange).toHaveBeenCalledTimes(2);
  poller.setToken(null);
  expect(onChange).toHaveBeenCalledTimes(3);
});

test("an answer for a replaced token is dropped, then the new token fills the snapshot", async () => {
  const releases: Record<string, () => void> = {};
  fetchSpy.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((resolve) => {
        const { Authorization } = init.headers as Record<string, string>;
        const number = Authorization.includes("ghp_a") ? 1 : 2;
        releases[Authorization] = () => resolve(json(200, searchBody([prNode({ number })], 1)));
      }),
  );
  poller.setToken("ghp_a");
  await vi.advanceTimersByTimeAsync(0);
  poller.setToken("ghp_b");
  releases["bearer ghp_a"]();
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: null });
  releases["bearer ghp_b"]();
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toMatchObject({ kind: "ready", prs: [{ number: 2 }] });
});

test("a new token resets a ready snapshot to waiting until its answer arrives", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot.kind).toBe("ready");
  fetchSpy.mockImplementationOnce(() => new Promise(() => {}));
  poller.setToken("ghp_other");
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "waiting", issue: null });
});

test("asks GitHub for the viewer once, then searches without hidden owners", async () => {
  const everything = vi.fn(githubFetch(async () => json(200, searchBody([prNode()], 1))));
  vi.stubGlobal("fetch", everything);
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(everything).toHaveBeenCalledTimes(3);
  const searchVariables = everything.mock.calls.map(([, init]) => JSON.parse(String(init.body)).variables.search);
  expect(searchVariables[1]).toMatch(/ -user:Nocture$/);
  expect(poller.viewer).toEqual({ login: "Nocture", organizations: ["acme"] });
  expect(poller.seenOwners).toEqual(["acme"]);
});

test("a failed viewer request is a failed poll", async () => {
  vi.stubGlobal("fetch", async () => json(401, { message: "Bad credentials" }));
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toEqual({ kind: "tokenProblem", problem: "expired" });
});

test("a new token forgets the viewer and the seen owners", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  fetchSpy.mockImplementationOnce(() => new Promise(() => {}));
  poller.setToken("ghp_other");
  expect(poller.viewer).toBeNull();
  expect(poller.seenOwners).toEqual([]);
});

test("a changed owner choice polls at once", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setOwnerChoices({ Acme: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetchSpy.mock.calls[1][1].body)).variables.search).toMatch(/ -user:Acme -user:Nocture$/);
});

test("an owner choice that keeps the search does not poll", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  poller.setOwnerChoices({ Acme: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("unticking every owner leaves the list empty and keeps polling", async () => {
  poller.setToken(TOKEN);
  await vi.advanceTimersByTimeAsync(0);
  fetchSpy.mockResolvedValue(json(200, searchBody([], 0)));
  poller.setOwnerChoices({ acme: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(poller.snapshot).toMatchObject({ kind: "ready", prs: [], totalCount: 0 });
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});
