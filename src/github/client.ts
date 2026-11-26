import { GitHubForbiddenError, GitHubRateLimitError, GitHubRequestError, GitHubSsoError, GitHubUnauthorizedError } from "./errors";
import { parseMyPullRequests } from "./parse";
import { MY_PRS_QUERY, TOKEN_STATUS_QUERY, VIEWER_LOGIN_QUERY, VIEWER_QUERY } from "./query";
import type { MyPullRequests, TokenStatus, Viewer } from "./types";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
export const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_OK = 200;
const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RESET_WAIT_MS = 24 * 60 * 60 * 1000;
const SSO_HEADER = "x-github-sso";
const RETRY_AFTER_HEADER = "retry-after";
const RATE_LIMIT_REMAINING_HEADER = "x-ratelimit-remaining";
const RATE_LIMIT_RESET_HEADER = "x-ratelimit-reset";
const SAML_WORD = "SAML";
const RATE_LIMITED_TYPE = "RATE_LIMITED";
// INSUFFICIENT_SCOPES is the answer to a classic token that lacks a scope.
const REFUSAL_TYPES: unknown[] = ["FORBIDDEN", "INSUFFICIENT_SCOPES"];
const UNKNOWN_GRAPHQL_ERROR = "Unknown GraphQL error";
const UNEXPECTED_RESPONSE = "Unexpected GitHub response";

export { GitHubForbiddenError, GitHubRateLimitError, GitHubRequestError, GitHubSsoError, GitHubUnauthorizedError };

export async function fetchMyPullRequests(token: string, search: string): Promise<MyPullRequests> {
  return parseMyPullRequests(await graphql(token, MY_PRS_QUERY, { search }));
}

export async function fetchViewer(token: string): Promise<Viewer> {
  let body: GraphQLBody;
  try {
    body = await graphql(token, VIEWER_QUERY);
  } catch (error) {
    if (!isOrganisationsRefusal(error)) throw error;
    body = await graphql(token, VIEWER_LOGIN_QUERY);
  }
  const viewer = (body.data as { viewer?: ViewerData } | undefined)?.viewer;
  if (typeof viewer?.login !== "string") throw new GitHubRequestError(HTTP_OK, UNEXPECTED_RESPONSE);
  const nodes = viewer.organizations?.nodes ?? [];
  const organizations = nodes.flatMap((node) => (typeof node?.login === "string" ? [node.login] : []));
  return { login: viewer.login, organizations };
}

export async function fetchTokenStatus(token: string): Promise<TokenStatus> {
  const { data } = await graphql(token, TOKEN_STATUS_QUERY);
  const { viewer, rateLimit } = (data ?? {}) as Partial<TokenStatusData>;
  if (typeof viewer?.login !== "string" || typeof rateLimit?.limit !== "number" || typeof rateLimit.remaining !== "number") {
    throw new GitHubRequestError(HTTP_OK, UNEXPECTED_RESPONSE);
  }
  return { login: viewer.login, remaining: rateLimit.remaining, limit: rateLimit.limit };
}

// A token that cannot read the organisations still has a login. The search reports a refusal when the PRs need it.
function isOrganisationsRefusal(error: unknown): boolean {
  if (error instanceof GitHubRequestError) return error.status === HTTP_OK;
  return error instanceof GitHubSsoError || error instanceof GitHubForbiddenError;
}

type TokenStatusData = { viewer: { login: string }; rateLimit: { limit: number; remaining: number } };
type ViewerData = { login?: unknown; organizations?: { nodes?: ({ login?: unknown } | null)[] } };
type GraphQLBody = { data?: unknown; errors?: unknown };

async function graphql(token: string, query: string, variables: object = {}): Promise<GraphQLBody> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token.trim()}`,
      "Content-Type": "application/json",
      "User-Agent": "github-pr-vitals",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await classifyFailure(response);
  const body = (await response.json()) as GraphQLBody | null;
  if (body?.errors) throw classifyGraphqlErrors(response, body.errors);
  return body ?? {};
}

export async function classifyFailure(response: Response): Promise<Error> {
  if (response.status === HTTP_UNAUTHORIZED) return new GitHubUnauthorizedError(response.statusText);
  const { status, headers } = response;
  const hasNoCallsLeft = headers.get(RATE_LIMIT_REMAINING_HEADER) === "0";
  const isRateLimited =
    status === HTTP_TOO_MANY_REQUESTS || (status === HTTP_FORBIDDEN && (hasNoCallsLeft || headers.has(RETRY_AFTER_HEADER)));
  if (isRateLimited) return new GitHubRateLimitError(hasNoCallsLeft ? primaryLimitResetMs(headers) : secondaryLimitResetMs(headers));
  if (status !== HTTP_FORBIDDEN) return new GitHubRequestError(status, response.statusText);
  if (headers.has(SSO_HEADER) || (await bodyMentionsSaml(response))) return new GitHubSsoError();
  return new GitHubForbiddenError(response.statusText);
}

function classifyGraphqlErrors(response: Response, errors: unknown): Error {
  const list: { type?: unknown; message?: unknown }[] = Array.isArray(errors) ? errors : [];
  if (list.some((error) => error?.type === RATE_LIMITED_TYPE)) {
    return new GitHubRateLimitError(primaryLimitResetMs(response.headers));
  }
  const mentionsSaml = list.some((error) => typeof error?.message === "string" && error.message.includes(SAML_WORD));
  if (mentionsSaml || response.headers.has(SSO_HEADER)) return new GitHubSsoError();
  if (list.some((error) => REFUSAL_TYPES.includes(error?.type))) return new GitHubForbiddenError(firstErrorMessage(errors));
  return new GitHubRequestError(HTTP_OK, firstErrorMessage(errors));
}

// The hourly limit: no calls are left until the reset header.
function primaryLimitResetMs(headers: Headers): number {
  const resetSeconds = numberHeader(headers, RATE_LIMIT_RESET_HEADER);
  const resetMs = resetSeconds === undefined ? undefined : resetSeconds * MILLISECONDS_PER_SECOND;
  return resetMs !== undefined && isWithinMaxWait(resetMs, Date.now()) ? resetMs : secondaryLimitResetMs(headers);
}

// A secondary limit also sends the reset header of the hourly limit. That reset is too late, so only Retry-After counts.
function secondaryLimitResetMs(headers: Headers): number {
  const nowMs = Date.now();
  const retryAfterSeconds = numberHeader(headers, RETRY_AFTER_HEADER);
  if (retryAfterSeconds !== undefined && retryAfterSeconds >= 0 && isWithinMaxWait(nowMs + retryAfterSeconds * MILLISECONDS_PER_SECOND, nowMs)) {
    return nowMs + retryAfterSeconds * MILLISECONDS_PER_SECOND;
  }
  return nowMs + DEFAULT_RATE_LIMIT_WAIT_MS;
}

function isWithinMaxWait(resetMs: number, nowMs: number): boolean {
  return resetMs >= 0 && resetMs - nowMs <= MAX_RESET_WAIT_MS;
}

function numberHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function bodyMentionsSaml(response: Response): Promise<boolean> {
  try {
    const { message } = (await response.json()) as { message?: unknown };
    return typeof message === "string" && message.includes(SAML_WORD);
  } catch {
    return false;
  }
}

function firstErrorMessage(errors: unknown): string {
  const message = Array.isArray(errors) ? errors[0]?.message : undefined;
  return typeof message === "string" ? message : UNKNOWN_GRAPHQL_ERROR;
}
