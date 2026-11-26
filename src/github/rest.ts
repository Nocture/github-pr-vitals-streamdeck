import { classifyFailure, REQUEST_TIMEOUT_MS } from "./client";
import { GitHubRequestError } from "./errors";

export const GITHUB_API_URL = "https://api.github.com";
const HTTP_OK = 200;

export async function fetchDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  const response = await fetch(`${GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: {
      Authorization: `bearer ${token.trim()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-pr-vitals",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await classifyFailure(response);
  const body = (await response.json()) as { default_branch?: unknown } | null;
  if (typeof body?.default_branch !== "string") throw new GitHubRequestError(HTTP_OK, "Unexpected GitHub response");
  return body.default_branch;
}
