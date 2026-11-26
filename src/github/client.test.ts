import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, prNode, searchBody, viewerBody } from "../test-support";
import {
  fetchMyPullRequests,
  fetchTokenStatus,
  fetchViewer,
  GitHubForbiddenError,
  GitHubRequestError,
  GitHubSsoError,
  GitHubUnauthorizedError,
} from "./client";
import { MY_PRS_SEARCH } from "./query";

const fetchStub = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.useRealTimers();
  fetchStub.mockReset();
  vi.unstubAllGlobals();
});

test("sends the trimmed token as a bearer token", async () => {
  fetchStub.mockResolvedValue(json(200, searchBody([prNode()])));
  await fetchMyPullRequests(" ghp_abc \n", MY_PRS_SEARCH);
  const headers = new Headers(fetchStub.mock.calls[0][1].headers);
  expect(headers.get("Authorization")).toBe("bearer ghp_abc");
});

test("sends one POST to the GitHub GraphQL endpoint with the search for my open pull requests", async () => {
  fetchStub.mockResolvedValue(json(200, searchBody([prNode()])));
  await fetchMyPullRequests("ghp_abc", MY_PRS_SEARCH);
  expect(fetchStub).toHaveBeenCalledOnce();
  const [url, init] = fetchStub.mock.calls[0];
  expect(url).toBe("https://api.github.com/graphql");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body).variables).toEqual({ search: MY_PRS_SEARCH });
});

test("a 401 answer is an unauthorized error", async () => {
  fetchStub.mockResolvedValue(json(401, { message: "Bad credentials" }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toBeInstanceOf(GitHubUnauthorizedError);
});

test("another failing status is a request error with that status", async () => {
  fetchStub.mockResolvedValue(json(502, {}));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ status: 502 });
});

test("a GraphQL error is a request error with its message", async () => {
  fetchStub.mockResolvedValue(json(200, { errors: [{ message: "Bad credentials" }] }));
  const failure = fetchMyPullRequests("token", MY_PRS_SEARCH);
  await expect(failure).rejects.toBeInstanceOf(GitHubRequestError);
  await expect(failure).rejects.toMatchObject({ status: 200, message: "Bad credentials" });
});

test("reads the login and rate limit of a token", async () => {
  fetchStub.mockResolvedValue(json(200, { data: { viewer: { login: "Nocture" }, rateLimit: { limit: 5000, remaining: 4990 } } }));
  expect(await fetchTokenStatus("token")).toEqual({ login: "Nocture", remaining: 4990, limit: 5000 });
});

test.each([[[]], ["boom"], [[{}]]])("GraphQL errors %j without a message give a fallback message", async (errors) => {
  fetchStub.mockResolvedValue(json(200, { errors }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ status: 200, message: "Unknown GraphQL error" });
});

test("an answer without data is a request error", async () => {
  fetchStub.mockImplementation(async () => json(200, {}));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toBeInstanceOf(GitHubRequestError);
  await expect(fetchTokenStatus("token")).rejects.toBeInstanceOf(GitHubRequestError);
});

const SAML_MESSAGE = "Resource protected by organization SAML enforcement.";
const NO_ACCESS_MESSAGE = "Resource not accessible by personal access token";
const MISSING_SCOPE_MESSAGE = "Your token has not been granted the required scopes to execute this query.";
const RESET_SECONDS = 1764079500;

test("a GraphQL RATE_LIMITED error is a rate limit until the reset time", async () => {
  fetchStub.mockResolvedValue(
    json(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, { "x-ratelimit-reset": String(RESET_SECONDS) }),
  );
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: RESET_SECONDS * 1000 });
});

test("a 403 with no calls left is a rate limit", async () => {
  fetchStub.mockResolvedValue(json(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(RESET_SECONDS) }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: RESET_SECONDS * 1000 });
});

test("a secondary rate limit waits for Retry-After", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-25T14:00:00Z") });
  const hourlyResetSeconds = String(Date.parse("2026-11-25T14:45:00Z") / 1000);
  fetchStub.mockResolvedValue(
    json(403, {}, { "retry-after": "30", "x-ratelimit-remaining": "12", "x-ratelimit-reset": hourlyResetSeconds }),
  );
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: Date.parse("2026-11-25T14:00:30Z") });
});

test("a rate limit without a reset header waits 60 s", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-25T14:00:00Z") });
  fetchStub.mockResolvedValue(json(429, {}));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: Date.parse("2026-11-25T14:01:00Z") });
});

test("a GraphQL RATE_LIMITED error without a reset header waits 60 s", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-25T14:00:00Z") });
  fetchStub.mockResolvedValue(json(200, { errors: [{ type: "RATE_LIMITED", message: "slow down" }] }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: Date.parse("2026-11-25T14:01:00Z") });
});

test("a reset header that is not a number counts as missing", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-25T14:00:00Z") });
  fetchStub.mockResolvedValue(json(429, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "soon" }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: Date.parse("2026-11-25T14:01:00Z") });
});

test.each([
  ["retry-after", "1e20"],
  ["retry-after", "-5"],
  ["retry-after", "90000"],
  ["x-ratelimit-reset", "1e20"],
  ["x-ratelimit-reset", "-1"],
])("a %s of %s counts as missing", async (name, value) => {
  vi.useFakeTimers({ now: new Date("2026-11-25T14:00:00Z") });
  fetchStub.mockResolvedValue(json(429, {}, { "x-ratelimit-remaining": "0", [name]: value }));
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toMatchObject({ resetMs: Date.parse("2026-11-25T14:01:00Z") });
});

test.each([
  ["a 403 that names SAML", json(403, { message: SAML_MESSAGE })],
  ["a 403 with the SSO header", json(403, { message: "Forbidden" }, { "x-github-sso": "required; url=https://github.com/x" })],
  ["a GraphQL error that names SAML", json(200, { errors: [{ type: "FORBIDDEN", message: SAML_MESSAGE }] })],
  ["a GraphQL answer with the SSO header", json(200, { errors: [{ message: "Forbidden" }] }, { "x-github-sso": "required" })],
])("%s is an SSO problem", async (_name, response) => {
  fetchStub.mockResolvedValue(response);
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toBeInstanceOf(GitHubSsoError);
});

test.each([
  ["a 403 for another reason", json(403, { message: NO_ACCESS_MESSAGE })],
  ["a GraphQL FORBIDDEN error", json(200, { errors: [{ type: "FORBIDDEN", message: NO_ACCESS_MESSAGE }] })],
  ["a GraphQL error for a missing scope", json(200, { errors: [{ type: "INSUFFICIENT_SCOPES", message: MISSING_SCOPE_MESSAGE }] })],
])("%s is a permission refusal", async (_name, response) => {
  fetchStub.mockResolvedValue(response);
  await expect(fetchMyPullRequests("token", MY_PRS_SEARCH)).rejects.toBeInstanceOf(GitHubForbiddenError);
});

test("reads the viewer and its organisations", async () => {
  fetchStub.mockResolvedValue(json(200, viewerBody("Nocture", ["Acme", "Zeta"])));
  expect(await fetchViewer("token")).toEqual({ login: "Nocture", organizations: ["Acme", "Zeta"] });
});

test.each([
  ["a GraphQL error", { errors: [{ message: "Resource not accessible" }] }],
  ["a permission refusal", { errors: [{ type: "FORBIDDEN", message: NO_ACCESS_MESSAGE }] }],
  ["an SSO refusal", { errors: [{ type: "FORBIDDEN", message: SAML_MESSAGE }] }],
])("falls back to the login when the organisations query gets %s", async (_name, refusal) => {
  fetchStub
    .mockResolvedValueOnce(json(200, refusal))
    .mockResolvedValueOnce(json(200, { data: { viewer: { login: "Nocture" } } }));
  expect(await fetchViewer("token")).toEqual({ login: "Nocture", organizations: [] });
});

test("a 502 on the viewer query fails without the fallback query", async () => {
  fetchStub.mockResolvedValue(json(502, {}));
  await expect(fetchViewer("token")).rejects.toMatchObject({ status: 502 });
  expect(fetchStub).toHaveBeenCalledOnce();
});
