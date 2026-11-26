import { afterEach, expect, test, vi } from "vitest";
import { GitHubUnauthorizedError } from "./errors";
import { fetchDefaultBranch } from "./rest";
import { json } from "../test-support";

afterEach(() => vi.unstubAllGlobals());

test("reads the default branch of a repo", async () => {
  const fetchStub = vi.fn(async (_url: string, _init: RequestInit) => json(200, { default_branch: "master" }));
  vi.stubGlobal("fetch", fetchStub);
  expect(await fetchDefaultBranch(" ghp_secret ", "acme", "billing")).toBe("master");
  const [url, init] = fetchStub.mock.calls[0];
  expect(url).toBe("https://api.github.com/repos/acme/billing");
  expect(init.headers).toEqual({
    Authorization: "bearer ghp_secret",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-pr-vitals",
  });
});

test("a 401 is an unauthorized error", async () => {
  vi.stubGlobal("fetch", async () => json(401, { message: "Bad credentials" }));
  await expect(fetchDefaultBranch("ghp_secret", "owner", "repo")).rejects.toBeInstanceOf(GitHubUnauthorizedError);
});
