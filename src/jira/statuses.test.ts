import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { JiraConfig } from "../settings";
import { json, streamDeckMock } from "../test-support";
import { JIRA_INTERVAL_MS, JIRA_NEW_TICKET_WAIT_MS, JIRA_STALE_MS, JiraStatuses } from "./statuses";
import type { JiraCredentials } from "./types";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);

const CONFIG: JiraConfig = {
  host: "example.atlassian.net",
  credentials: { email: "me@example.com", token: "jira-secret" },
  projects: ["ABC"],
};
const NEW_TOKEN_CONFIG: JiraConfig = { ...CONFIG, credentials: { ...CONFIG.credentials, token: "new-secret" } };
const DONE = { name: "Done", isResolved: true };
const NOW = 1_700_000_000_000;
const TENANT_INFO_PATH = "/_edge/tenant_info";
const TENANT_INFO_URL = `https://example.atlassian.net${TENANT_INFO_PATH}`;
const warn = streamDeckMock.default.logger.warn;

type Bulkfetch = (tickets: string[]) => Response | Promise<Response>;

function allDone(tickets: string[]): Response {
  return json(200, { issues: tickets.map((key) => ({ key, fields: { status: { name: "Done", statusCategory: { key: "done" } } } })) });
}

// Each bulk call takes the next answer. The last answer repeats.
function stubJira(...answers: Bulkfetch[]) {
  let bulkCallCount = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith(TENANT_INFO_PATH)) return json(200, { cloudId: "cloud-1" });
    const answer = answers[Math.min(bulkCallCount++, answers.length - 1)];
    return answer(JSON.parse(String(init.body)).issueIdsOrKeys);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type FetchMock = ReturnType<typeof stubJira>;

function tenantInfoUrls(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(([url]) => url).filter((url) => url.endsWith(TENANT_INFO_PATH));
}

function bulkCalls(fetchMock: FetchMock): RequestInit[] {
  return fetchMock.mock.calls.filter(([url]) => !url.endsWith(TENANT_INFO_PATH)).map(([, init]) => init);
}

function askedTickets(fetchMock: FetchMock): string[][] {
  return bulkCalls(fetchMock).map((init) => JSON.parse(String(init.body)).issueIdsOrKeys);
}

function basicAuthorization({ email, token }: JiraCredentials): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

let statuses: JiraStatuses;

beforeEach(() => {
  warn.mockClear();
  statuses = new JiraStatuses();
  statuses.configure(CONFIG);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks Jira at once, then every 5 minutes", async () => {
  const fetchMock = stubJira(allDone);

  expect(await statuses.refresh(["ABC-1"], NOW)).toBe(true);
  expect(statuses.statusOf("ABC-1")).toEqual(DONE);
  await statuses.refresh(["ABC-1"], NOW + JIRA_INTERVAL_MS - 1);
  await statuses.refresh(["ABC-1"], NOW + JIRA_INTERVAL_MS);

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"], ["ABC-1"]]);
  expect(tenantInfoUrls(fetchMock)).toEqual([TENANT_INFO_URL]);
  expect(statuses.updatedMs).toBe(NOW + JIRA_INTERVAL_MS);
});

test("asks again within a minute for a new ticket", async () => {
  const fetchMock = stubJira(allDone);
  await statuses.refresh(["ABC-1"], NOW);

  await statuses.refresh(["ABC-1", "ABC-2"], NOW + JIRA_NEW_TICKET_WAIT_MS - 1);
  expect(await statuses.refresh(["ABC-1", "ABC-2"], NOW + JIRA_NEW_TICKET_WAIT_MS)).toBe(true);

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"], ["ABC-1", "ABC-2"]]);
  expect(statuses.statusOf("ABC-2")).toEqual(DONE);
});

test("without a config it never calls Jira", async () => {
  const fetchMock = stubJira(allDone);
  statuses.configure(null);

  expect(await statuses.refresh(["ABC-1"], NOW)).toBe(false);

  expect(fetchMock).not.toHaveBeenCalled();
});

test("a refused Jira token forgets every status", async () => {
  stubJira(allDone, () => json(401, { errorMessages: ["Unauthorized"] }));
  await statuses.refresh(["ABC-1"], NOW);

  expect(await statuses.refresh(["ABC-1"], NOW + JIRA_INTERVAL_MS)).toBe(true);

  expect(statuses.statusOf("ABC-1")).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith("Jira poll failed: Jira refused the credentials");
});

test("a failed Jira call is tried again within a minute", async () => {
  const fetchMock = stubJira(() => json(502, {}), allDone);
  await statuses.refresh(["ABC-1"], NOW);

  await statuses.refresh(["ABC-1"], NOW + JIRA_NEW_TICKET_WAIT_MS - 1);
  expect(await statuses.refresh(["ABC-1"], NOW + JIRA_NEW_TICKET_WAIT_MS)).toBe(true);

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"], ["ABC-1"]]);
});

test("a refused Jira token is asked again only after 5 minutes", async () => {
  const fetchMock = stubJira(() => json(401, {}));
  await statuses.refresh(["ABC-1"], NOW);

  await statuses.refresh(["ABC-1"], NOW + JIRA_INTERVAL_MS - 1);
  await statuses.refresh(["ABC-1"], NOW + JIRA_INTERVAL_MS);

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"], ["ABC-1"]]);
});

test.each([
  ["refused", 401, NOW + JIRA_INTERVAL_MS],
  ["stale", 502, NOW + JIRA_STALE_MS],
])("statuses that are cleared as %s have no answer time", async (_reason, failedStatus, failedCallMs) => {
  stubJira(allDone, () => json(failedStatus, {}));
  await statuses.refresh(["ABC-1"], NOW);

  await statuses.refresh(["ABC-1"], failedCallMs);

  expect(statuses.updatedMs).toBeNull();
});

test("another failure keeps the statuses until 15 minutes after the last answer", async () => {
  stubJira(allDone, () => json(502, {}));
  await statuses.refresh(["ABC-1"], NOW);

  expect(await statuses.refresh(["ABC-1"], NOW + JIRA_STALE_MS - 1)).toBe(false);
  expect(statuses.statusOf("ABC-1")).toEqual(DONE);
  expect(await statuses.refresh(["ABC-1"], NOW + JIRA_STALE_MS - 1 + JIRA_INTERVAL_MS)).toBe(true);
  expect(statuses.statusOf("ABC-1")).toBeNull();
});

test("the same config keeps the statuses, and a changed token forgets them and asks at once", async () => {
  const fetchMock = stubJira(allDone);
  await statuses.refresh(["ABC-1"], NOW);

  statuses.configure({ ...CONFIG, credentials: { ...CONFIG.credentials }, projects: [...CONFIG.projects] });
  expect(statuses.statusOf("ABC-1")).toEqual(DONE);
  statuses.configure(NEW_TOKEN_CONFIG);
  expect(statuses.statusOf("ABC-1")).toBeNull();
  await statuses.refresh(["ABC-1"], NOW + 1);

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"], ["ABC-1"]]);
});

test("a refresh while Jira has not answered yet asks nothing", async () => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  const fetchMock = stubJira(async (tickets) => {
    await answered;
    return allDone(tickets);
  });

  const first = statuses.refresh(["ABC-1"], NOW);
  expect(await statuses.refresh(["ABC-1", "ABC-2"], NOW + JIRA_INTERVAL_MS)).toBe(false);
  answer();
  await first;

  expect(askedTickets(fetchMock)).toEqual([["ABC-1"]]);
});

test("a config change during a call drops its answer and asks with the new config at once", async () => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  const fetchMock = stubJira(
    async (tickets) => {
      await answered;
      return allDone(tickets);
    },
    () => json(502, {}),
  );

  const first = statuses.refresh(["ABC-1"], NOW);
  statuses.configure(NEW_TOKEN_CONFIG);
  answer();
  await first;

  expect(statuses.statusOf("ABC-1")).toBeNull();
  const authorizations = bulkCalls(fetchMock).map((init) => (init.headers as Record<string, string>).Authorization);
  expect(authorizations).toEqual([basicAuthorization(CONFIG.credentials), basicAuthorization(NEW_TOKEN_CONFIG.credentials)]);
});

test("a new Jira site asks for its cloud id again", async () => {
  const fetchMock = stubJira(allDone);
  await statuses.refresh(["ABC-1"], NOW);

  statuses.configure({ ...CONFIG, host: "other.atlassian.net" });
  await statuses.refresh(["ABC-1"], NOW + 1);

  expect(tenantInfoUrls(fetchMock)).toEqual([TENANT_INFO_URL, `https://other.atlassian.net${TENANT_INFO_PATH}`]);
});
