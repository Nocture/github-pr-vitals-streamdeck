import streamDeck from "@elgato/streamdeck";
import { messageOf } from "../log";
import { fetchDefaultBranch } from "../github/rest";

export const DEFAULT_BRANCH_RETRY_MS = 3_600_000;

type Repo = { owner: string; repo: string };

export class DefaultBranches {
  private token: string | null = null;
  private readonly branches = new Map<string, string>();
  private readonly failedAtMs = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  branchOf(owner: string, repo: string): string | undefined {
    return this.branches.get(keyOf(owner, repo));
  }

  /** A different token forgets every branch, because it may see other repos. */
  useToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    this.branches.clear();
    this.failedAtMs.clear();
    this.inFlight.clear();
  }

  async load(token: string, repos: Repo[], nowMs: number): Promise<boolean> {
    this.useToken(token);
    const wanted = new Map(repos.map((repo) => [keyOf(repo.owner, repo.repo), repo]));
    const toAsk = [...wanted].filter(([key]) => !this.branches.has(key) && !this.inFlight.has(key) && !this.isWaitingToRetry(key, nowMs));
    const results = await Promise.all(toAsk.map(([key, repo]) => this.lookUp(token, key, repo, nowMs)));
    return results.some(Boolean);
  }

  private isWaitingToRetry(key: string, nowMs: number): boolean {
    const failedMs = this.failedAtMs.get(key);
    return failedMs !== undefined && nowMs - failedMs < DEFAULT_BRANCH_RETRY_MS;
  }

  private async lookUp(token: string, key: string, { owner, repo }: Repo, nowMs: number): Promise<boolean> {
    this.inFlight.add(key);
    try {
      const branch = await fetchDefaultBranch(token, owner, repo);
      if (token !== this.token) return false;
      this.branches.set(key, branch);
      this.failedAtMs.delete(key);
      return true;
    } catch (error) {
      streamDeck.logger.warn(`Default branch lookup failed for ${key}: ${messageOf(error)}`);
      if (token === this.token) this.failedAtMs.set(key, nowMs);
      return false;
    } finally {
      if (token === this.token) this.inFlight.delete(key);
    }
  }
}

function keyOf(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}
