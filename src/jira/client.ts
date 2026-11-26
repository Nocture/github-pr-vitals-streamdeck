import type { JiraCredentials, JiraStatus } from "./types";

const JIRA_GATEWAY_URL = "https://api.atlassian.com/ex/jira";
export const JIRA_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_OK = 200;
const RESOLVED_CATEGORY_KEY = "done";
const UNEXPECTED_RESPONSE = "Unexpected Jira response";

export class JiraUnauthorizedError extends Error {
  constructor() {
    super("Jira refused the credentials");
    this.name = "JiraUnauthorizedError";
  }
}

export class JiraRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "JiraRequestError";
    this.status = status;
  }
}

export async function fetchCloudId(host: string): Promise<string> {
  const body = await requestJson(`https://${host}/_edge/tenant_info`, { method: "GET", headers: { Accept: "application/json" } });
  const cloudId = (body as { cloudId?: unknown } | null)?.cloudId;
  if (typeof cloudId !== "string" || cloudId === "") throw new JiraRequestError(HTTP_OK, UNEXPECTED_RESPONSE);
  return cloudId;
}

export async function fetchStatuses(credentials: JiraCredentials, cloudId: string, tickets: string[]): Promise<Map<string, JiraStatus>> {
  const statuses = new Map<string, JiraStatus>();
  for (let start = 0; start < tickets.length; start += JIRA_BATCH_SIZE) {
    const issueIdsOrKeys = tickets.slice(start, start + JIRA_BATCH_SIZE);
    const body = await requestJson(`${apiUrl(cloudId)}/issue/bulkfetch`, {
      method: "POST",
      headers: { ...authorizedHeaders(credentials), "Content-Type": "application/json" },
      body: JSON.stringify({ issueIdsOrKeys, fields: ["status"] }),
    });
    const issues = (body as { issues?: unknown } | null)?.issues;
    if (!Array.isArray(issues)) throw new JiraRequestError(HTTP_OK, UNEXPECTED_RESPONSE);
    for (const issue of issues as IssueData[]) {
      const status = issue?.fields?.status;
      if (typeof issue?.key === "string" && typeof status?.name === "string") {
        statuses.set(issue.key, { name: status.name, isResolved: status.statusCategory?.key === RESOLVED_CATEGORY_KEY });
      }
    }
  }
  return statuses;
}

export async function testJiraCredentials(credentials: JiraCredentials, cloudId: string): Promise<void> {
  await requestJson(`${apiUrl(cloudId)}/statuscategory`, { method: "GET", headers: authorizedHeaders(credentials) });
}

type IssueData = { key?: unknown; fields?: { status?: { name?: unknown; statusCategory?: { key?: unknown } } } };

function apiUrl(cloudId: string): string {
  return `${JIRA_GATEWAY_URL}/${encodeURIComponent(cloudId)}/rest/api/3`;
}

function authorizedHeaders({ email, token }: JiraCredentials): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, Accept: "application/json" };
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": "github-pr-vitals", ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) throw new JiraUnauthorizedError();
  if (!response.ok) throw new JiraRequestError(response.status, `Jira answered HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new JiraRequestError(response.status, UNEXPECTED_RESPONSE);
  }
}
