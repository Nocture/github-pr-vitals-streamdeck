import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BUILD_LABEL } from "./build";
import { TOKEN_PAGE_URL } from "./github/token-pages";
import { answerPropertyInspector, type PropertyInspectorHost } from "./property-inspector";
import { json, stage, streamDeckMock } from "./test-support";

vi.mock("@elgato/streamdeck", async () => (await import("./test-support")).streamDeckMock);

const sendToPropertyInspector = streamDeckMock.default.ui.sendToPropertyInspector;
const openUrl = streamDeckMock.default.system.openUrl;

const OWNER_OPTIONS = [{ login: "Nocture", isOwnAccount: true, isShown: false }];
const host = {
  setRepoColor: vi.fn(async () => {}),
  lastUpdateMs: () => 1_700_000_000_000,
  lastJiraUpdateMs: () => 1_700_000_100_000,
  isJiraConfigured: () => true,
  ownerOptions: () => OWNER_OPTIONS,
  setOwnerShown: vi.fn(async () => {}),
} satisfies PropertyInspectorHost;

beforeEach(() => {
  stage.globalSettings = { githubToken: "ghp_secret" };
  sendToPropertyInspector.mockClear();
  openUrl.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the token test reports the login and the calls left", async () => {
  vi.stubGlobal("fetch", async () =>
    json(200, { data: { viewer: { login: "Nocture" }, rateLimit: { limit: 5000, remaining: 4988 } } }),
  );
  await answerPropertyInspector({ event: "testToken" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "tokenStatus", login: "Nocture", remaining: 4988, limit: 5000 });
});

test("the token test says when GitHub refuses the token", async () => {
  vi.stubGlobal("fetch", async () => json(401, { message: "Bad credentials" }));
  await answerPropertyInspector({ event: "testToken" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "tokenStatus", error: "GitHub refused the token." });
});

test("the token test asks for a token when there is none", async () => {
  stage.globalSettings = {};
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await answerPropertyInspector({ event: "testToken" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "tokenStatus", error: "Add a token first." });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("the token test reports another failure by its message", async () => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 502, statusText: "Bad Gateway" }));
  await answerPropertyInspector({ event: "testToken" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "tokenStatus", error: "Bad Gateway" });
});

test("the token link opens the page for a new token", async () => {
  await answerPropertyInspector({ event: "openTokenPage" }, host);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(TOKEN_PAGE_URL);
});

const JIRA_SETTINGS = { jiraSite: "example.atlassian.net", jiraEmail: "me@example.com", jiraToken: "jira-secret", jiraProjects: "ABC" };

function stubJira(statusCategoryAnswer: Response) {
  vi.stubGlobal("fetch", async (url: string) =>
    url === "https://example.atlassian.net/_edge/tenant_info" ? json(200, { cloudId: "cloud-1" }) : statusCategoryAnswer,
  );
}

test("the Jira test reports success", async () => {
  stage.globalSettings = JIRA_SETTINGS;
  stubJira(json(200, [{ key: "done" }]));
  await answerPropertyInspector({ event: "testJira" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "jiraStatus", ok: true });
});

test("the Jira test asks for the missing fields", async () => {
  stage.globalSettings = { ...JIRA_SETTINGS, jiraEmail: "" };
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await answerPropertyInspector({ event: "testJira" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({
    event: "jiraStatus",
    error: "Fill in the Jira site, email, token and projects first.",
  });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("the Jira test says when Jira refuses the token", async () => {
  stage.globalSettings = JIRA_SETTINGS;
  stubJira(json(401, { errorMessages: ["Unauthorized"] }));
  await answerPropertyInspector({ event: "testJira" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "jiraStatus", error: "Jira refused the token." });
});

test("the build reply carries the build label", async () => {
  await answerPropertyInspector({ event: "getBuild" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "build", label: BUILD_LABEL });
});

test("answers the last update time and the poll interval", async () => {
  await answerPropertyInspector({ event: "getStatus" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({
    event: "status",
    githubUpdatedMs: 1_700_000_000_000,
    githubIntervalMs: 60_000,
    isJiraConfigured: true,
    jiraUpdatedMs: 1_700_000_100_000,
    jiraIntervalMs: 300_000,
  });
});

test("passes a colour choice to the host", async () => {
  await answerPropertyInspector({ event: "setRepoColor", repo: "billing", color: "#38bdf8" }, host);
  expect(host.setRepoColor).toHaveBeenCalledWith("billing", "#38bdf8");
});

test("answers the owner options", async () => {
  await answerPropertyInspector({ event: "getOwners" }, host);
  expect(sendToPropertyInspector).toHaveBeenCalledWith({ event: "owners", owners: OWNER_OPTIONS });
});

test("saves an owner choice", async () => {
  await answerPropertyInspector({ event: "setOwnerShown", login: "Nocture", isShown: true }, host);
  expect(host.setOwnerShown).toHaveBeenCalledWith("Nocture", true);
});
