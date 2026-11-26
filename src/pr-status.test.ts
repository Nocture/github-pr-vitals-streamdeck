import { afterEach, beforeEach, expect, type Mock, test, vi } from "vitest";
import type { PullRequest } from "./github/types";
import { FRAME_MS } from "./frame-timer";
import { MY_PRS_SEARCH } from "./github/query";
import { POLL_INTERVAL_MS } from "./poller";
import { APPEAR_SETTLE_MS, PrStatus, type StatusView } from "./pr-status";
import { githubFetch, json, prNode, searchBody, type SearchFetch, stage, streamDeckMock } from "./test-support";

vi.mock("@elgato/streamdeck", async () => (await import("./test-support")).streamDeckMock);

function createView(isAnimating: boolean) {
  return { hasVisibleKeys: () => true, isAnimating: () => isAnimating, redraw: vi.fn(async () => {}) } satisfies StatusView;
}

const { setGlobalSettings } = streamDeckMock.default.settings;
const TOKEN = "ghp_secret";

function savedSettings(call = -1) {
  return setGlobalSettings.mock.calls.at(call)?.[0] as Record<string, unknown>;
}

const NEW_REPO_PR = prNode({ repository: { name: "mobile-app", owner: { login: "acme" } } });

let searchFetch: Mock<SearchFetch>;

async function startStatus(settings: object, pr: object = NEW_REPO_PR, view = createView(false)) {
  stage.globalSettings = settings;
  searchFetch = vi.fn<SearchFetch>(async () => json(200, searchBody([pr])));
  vi.stubGlobal("fetch", githubFetch(searchFetch));
  const status = new PrStatus();
  status.addView(view);
  status.keysChanged();
  await status.start();
  await vi.advanceTimersByTimeAsync(0);
  return status;
}

beforeEach(() => {
  vi.useFakeTimers();
  setGlobalSettings.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a view that fails to redraw stops neither the other views nor the animation", async () => {
  const status = new PrStatus();
  const failing = createView(false);
  failing.redraw.mockRejectedValue(new Error("Stream Deck is not connected"));
  const animating = createView(true);
  status.addView(failing);
  status.addView(animating);
  await status.redrawAll();
  expect(animating.redraw).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  expect(status.frame).toBe(1);
});

test("a new repo gets a free colour that is saved", async () => {
  await startStatus({ githubToken: TOKEN });
  expect(setGlobalSettings).toHaveBeenCalledTimes(1);
  expect(savedSettings()).toMatchObject({ githubToken: TOKEN, repoColors: { "mobile-app": "#a3e635" } });
});

test("a saved colour survives a restart", async () => {
  const status = await startStatus({ githubToken: TOKEN, repoColors: { billing: "#38bdf8" } }, prNode());
  const pr = (status.snapshot as { prs: PullRequest[] }).prs[0];
  expect(status.viewOf(pr).repoColor).toBe("#38bdf8");
});

test("a failed settings write is logged without the token and does not stop the redraw", async () => {
  const warn = streamDeckMock.default.logger.warn;
  warn.mockClear();
  const view = createView(false);
  const status = await startStatus({ githubToken: TOKEN }, prNode(), view);
  view.redraw.mockClear();
  setGlobalSettings.mockRejectedValueOnce(new Error("Stream Deck is not connected"));
  await status.setRepoColor("billing", "#38bdf8");
  await vi.advanceTimersByTimeAsync(0);
  expect(warn).toHaveBeenCalledWith("Settings save failed: Stream Deck is not connected");
  expect(warn.mock.calls.flat().join(" ")).not.toContain(TOKEN);
  expect(view.redraw).toHaveBeenCalledTimes(1);
});

test("the settings page can hide an owner, which is saved and leaves the search", async () => {
  const status = await startStatus({ githubToken: TOKEN, ownerChoices: { Old: true } });
  expect(status.ownerOptions().map(({ login }) => login)).toEqual(["Nocture", "acme", "Old"]);
  setGlobalSettings.mockClear();
  await status.setOwnerShown("acme", false);
  await vi.advanceTimersByTimeAsync(0);
  expect(savedSettings()).toMatchObject({ ownerChoices: { Old: true, acme: false } });
  const { search } = JSON.parse(String(searchFetch.mock.lastCall?.[1].body)).variables;
  expect(search).toBe(`${MY_PRS_SEARCH} -user:Nocture -user:acme`);
});

test("an owner choice for an unknown owner writes nothing", async () => {
  const status = await startStatus({ githubToken: TOKEN });
  setGlobalSettings.mockClear();
  await status.setOwnerShown("stranger", true);
  expect(setGlobalSettings).not.toHaveBeenCalled();
});

test.each([
  ["changes asked", { reviewDecision: "CHANGES_REQUESTED" }],
  ["behind main", { reviewDecision: "APPROVED", mergeStateStatus: "BEHIND" }],
  ["conflicts", { reviewDecision: "APPROVED", mergeStateStatus: "DIRTY" }],
])("a notice replaces the review problem: %s", async (problem, review) => {
  const status = await startStatus({ githubToken: TOKEN }, prNode(review));
  const pr = (status.snapshot as { prs: PullRequest[] }).prs[0];
  expect(status.viewOf(pr).problem).toBe(problem);
  searchFetch.mockRejectedValue(new TypeError("fetch failed"));
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(status.viewOf(pr).problem).toBe("offline 1m");
});

test("a page of keys that appears at once is drawn once", async () => {
  const view = createView(false);
  const status = new PrStatus();
  status.addView(view);
  status.keysChanged();
  status.keysChanged();
  status.keysChanged();
  await vi.advanceTimersByTimeAsync(APPEAR_SETTLE_MS - 1);
  expect(view.redraw).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(view.redraw).toHaveBeenCalledTimes(1);
});

test("the Deploy list holds approved PRs into the default branch", async () => {
  const approved = { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN" };
  const intoMaster = prNode({ ...approved, number: 1, baseRefName: "master" });
  const intoMain = prNode({ ...approved, number: 2, baseRefName: "main" });
  stage.globalSettings = { githubToken: TOKEN };
  vi.stubGlobal(
    "fetch",
    githubFetch((url) =>
      url.startsWith("https://api.github.com/repos/") ? json(200, { default_branch: "master" }) : json(200, searchBody([intoMaster, intoMain])),
    ),
  );
  const status = new PrStatus();
  status.addView(createView(false));
  status.keysChanged();
  await status.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(status.deployPrs().map((pr) => pr.number)).toEqual([1]);
});

test("a resolved Jira ticket redraws the keys with the tick", async () => {
  stage.globalSettings = {
    githubToken: TOKEN,
    jiraSite: "example.atlassian.net",
    jiraEmail: "me@example.com",
    jiraToken: "jira-secret",
    jiraProjects: "ABC",
  };
  const closed = { key: "ABC-20415", fields: { status: { name: "Closed", statusCategory: { key: "done" } } } };
  vi.stubGlobal(
    "fetch",
    githubFetch((url) => {
      if (url === "https://example.atlassian.net/_edge/tenant_info") return json(200, { cloudId: "cloud-1" });
      if (url.endsWith("/issue/bulkfetch")) return json(200, { issues: [closed] });
      return json(200, searchBody([prNode()]));
    }),
  );
  const status = new PrStatus();
  const resolvedAtRedraw: boolean[] = [];
  const view = createView(false);
  view.redraw.mockImplementation(async () => {
    const { snapshot } = status;
    if (snapshot.kind === "ready") resolvedAtRedraw.push(status.viewOf(snapshot.prs[0]).isTicketResolved);
  });
  status.addView(view);
  status.keysChanged();
  await status.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(resolvedAtRedraw[0]).toBe(false);
  expect(resolvedAtRedraw.at(-1)).toBe(true);
});
