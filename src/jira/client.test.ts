import { afterEach, expect, test, vi } from "vitest";
import { json } from "../test-support";
import { fetchCloudId, fetchStatuses, JIRA_BATCH_SIZE, JiraRequestError, JiraUnauthorizedError, testJiraCredentials } from "./client";

const CREDENTIALS = { email: "me@example.com", token: "secret" };
const CLOUD_ID = "cloud-1";
const BULKFETCH_URL = `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3/issue/bulkfetch`;

function issue(key: string, name: string, categoryKey: string): object {
  return { key, fields: { status: { name, statusCategory: { key: categoryKey } } } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...answers: Response[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) fetchMock.mockResolvedValueOnce(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("reads the cloud id of a site", async () => {
  const fetchMock = stubFetch(json(200, { cloudId: CLOUD_ID }));

  expect(await fetchCloudId("example.atlassian.net")).toBe(CLOUD_ID);
  expect(fetchMock.mock.calls[0][0]).toBe("https://example.atlassian.net/_edge/tenant_info");
});

test("reads the status of each ticket in one call", async () => {
  const fetchMock = stubFetch(json(200, { issues: [issue("ABC-1", "Done", "done"), issue("XYZ-2", "In Review", "indeterminate")] }));

  const statuses = await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1", "XYZ-2"]);

  expect(statuses).toEqual(
    new Map([
      ["ABC-1", { name: "Done", isResolved: true }],
      ["XYZ-2", { name: "In Review", isResolved: false }],
    ]),
  );
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(BULKFETCH_URL);
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ issueIdsOrKeys: ["ABC-1", "XYZ-2"], fields: ["status"] });
  expect(init.headers.Authorization).toBe("Basic " + Buffer.from("me@example.com:secret").toString("base64"));
});

test("asks in batches of 100", async () => {
  const tickets = Array.from({ length: 150 }, (_, index) => `ABC-${index + 1}`);
  const fetchMock = stubFetch(json(200, { issues: [] }), json(200, { issues: [issue("ABC-150", "Done", "done")] }));

  const statuses = await fetchStatuses(CREDENTIALS, CLOUD_ID, tickets);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).issueIdsOrKeys).toHaveLength(JIRA_BATCH_SIZE);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).issueIdsOrKeys).toHaveLength(50);
  expect(statuses.get("ABC-150")).toEqual({ name: "Done", isResolved: true });
});

test("a ticket Jira does not return has no status", async () => {
  stubFetch(json(200, { issues: [issue("ABC-1", "Done", "done")] }));

  const statuses = await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1", "ABC-2"]);

  expect([...statuses.keys()]).toEqual(["ABC-1"]);
});

test("a status without a category is not resolved, and a malformed issue is skipped", async () => {
  stubFetch(
    json(200, { issues: [{ key: "ABC-1", fields: { status: { name: "Odd" } } }, { fields: { status: { name: "No key" } } }, { key: "ABC-3", fields: {} }] }),
  );

  expect(await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1", "ABC-3"])).toEqual(new Map([["ABC-1", { name: "Odd", isResolved: false }]]));
});

test("asks for nothing when there are no tickets", async () => {
  const fetchMock = stubFetch();

  expect(await fetchStatuses(CREDENTIALS, CLOUD_ID, [])).toEqual(new Map());
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([401, 403])("a %i is an unauthorized error whose message holds neither token nor email", async (status) => {
  stubFetch(json(status, { message: "bad me@example.com secret" }));

  const error = await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1"]).catch((caught: Error) => caught);

  expect(error).toBeInstanceOf(JiraUnauthorizedError);
  expect((error as Error).message).not.toMatch(/secret|me@example\.com/);
});

test("another failure status is a request error with that status", async () => {
  stubFetch(json(500, {}));

  const error = await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1"]).catch((caught: Error) => caught);

  expect(error).toBeInstanceOf(JiraRequestError);
  expect((error as JiraRequestError).status).toBe(500);
});

test("an answer of the wrong shape is a request error that does not quote the body", async () => {
  stubFetch(json(200, { surprise: "secret-body" }));

  const error = await fetchStatuses(CREDENTIALS, CLOUD_ID, ["ABC-1"]).catch((caught: Error) => caught);

  expect(error).toBeInstanceOf(JiraRequestError);
  expect((error as Error).message).not.toContain("secret-body");
});

test("a site that gives no cloud id is a request error", async () => {
  stubFetch(json(200, {}));

  await expect(fetchCloudId("example.atlassian.net")).rejects.toBeInstanceOf(JiraRequestError);
});

test("tests credentials with the status category call", async () => {
  const fetchMock = stubFetch(json(200, []));

  await testJiraCredentials(CREDENTIALS, CLOUD_ID);

  expect(fetchMock.mock.calls[0][0]).toBe(`https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3/statuscategory`);
  expect(fetchMock.mock.calls[0][1].method).toBe("GET");
});

test("tested credentials that Jira refuses are an unauthorized error", async () => {
  stubFetch(json(401, {}));

  await expect(testJiraCredentials(CREDENTIALS, CLOUD_ID)).rejects.toBeInstanceOf(JiraUnauthorizedError);
});
