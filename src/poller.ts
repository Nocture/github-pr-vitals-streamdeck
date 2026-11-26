import streamDeck from "@elgato/streamdeck";
import {
  fetchMyPullRequests,
  fetchViewer,
  GitHubForbiddenError,
  GitHubRateLimitError,
  GitHubSsoError,
  GitHubUnauthorizedError,
} from "./github/client";
import { ownerSearch } from "./github/owners";
import type { PullRequest, Viewer } from "./github/types";
import { messageOf, REDRAW_LABEL } from "./log";
import { sortMyPrs } from "./prs/derive";

export const POLL_INTERVAL_MS = 60_000;

export type PollIssue = { kind: "offline" } | { kind: "rateLimited"; untilMs: number };
type TokenProblem = "expired" | "sso" | "noAccess";

export type PrSnapshot =
  | { kind: "noToken" }
  | { kind: "tokenProblem"; problem: TokenProblem }
  | { kind: "waiting"; issue: PollIssue | null }
  | { kind: "ready"; prs: PullRequest[]; totalCount: number; updatedMs: number; issue: PollIssue | null };

function withIssue(snapshot: PrSnapshot, issue: PollIssue): PrSnapshot {
  return snapshot.kind === "waiting" || snapshot.kind === "ready" ? { ...snapshot, issue } : snapshot;
}

/**
 * Reads the open pull requests every 60 s, and only while a plugin key is visible.
 * A request while no key is visible sends nothing. The next visible key polls at once.
 */
export class Poller {
  // Waiting until the first token arrives, so that no key asks for a token before the settings load.
  private current: PrSnapshot = { kind: "waiting", issue: null };
  private token: string | null = null;
  private isTokenKnown = false;
  private isVisible = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pausedUntilMs: number | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private isRerunQueued = false;
  private currentViewer: Viewer | null = null;
  private ownersSeen = new Set<string>();
  private ownerChoices: Record<string, boolean> = {};

  constructor(private readonly onChange: () => void) {}

  get snapshot(): PrSnapshot {
    return this.current;
  }

  get viewer(): Viewer | null {
    return this.currentViewer;
  }

  get seenOwners(): string[] {
    return [...this.ownersSeen];
  }

  setOwnerChoices(choices: Record<string, boolean>): void {
    const previousSearch = this.currentSearch();
    this.ownerChoices = { ...choices };
    if (previousSearch !== null && previousSearch !== this.currentSearch()) void this.pollNow();
  }

  setToken(token: string | null): void {
    if (this.isTokenKnown && token === this.token) return;
    this.isTokenKnown = true;
    this.token = token;
    this.currentViewer = null;
    this.ownersSeen = new Set();
    this.current = token === null ? { kind: "noToken" } : { kind: "waiting", issue: null };
    this.clearPause();
    this.notify();
    void this.pollNow();
  }

  setVisible(isVisible: boolean): void {
    if (isVisible === this.isVisible) return;
    this.isVisible = isVisible;
    if (isVisible) {
      this.timer = setInterval(() => void this.pollNow(), POLL_INTERVAL_MS);
      this.armPauseTimer();
      void this.pollNow();
    } else {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.clearPauseTimer();
    }
  }

  pollNow(): Promise<void> {
    if (this.running) {
      this.isRerunQueued = true;
      return this.running;
    }
    this.running = this.pollUntilIdle();
    return this.running;
  }

  private async pollUntilIdle(): Promise<void> {
    await Promise.resolve(); // lets requests from the same tick share one poll
    do {
      this.isRerunQueued = false;
      await this.pollOnce();
    } while (this.isRerunQueued);
    this.running = null;
  }

  private async pollOnce(): Promise<void> {
    const polledToken = this.token;
    if (polledToken === null || !this.isVisible || this.isPaused()) return;
    let next: PrSnapshot;
    try {
      const viewer = this.currentViewer ?? (await fetchViewer(polledToken));
      if (polledToken !== this.token) return;
      this.currentViewer = viewer;
      const { prs, totalCount } = await fetchMyPullRequests(polledToken, ownerSearch(viewer.login, this.ownerChoices));
      if (polledToken === this.token) for (const pr of prs) this.ownersSeen.add(pr.owner);
      next = { kind: "ready", prs: sortMyPrs(prs), totalCount, updatedMs: Date.now(), issue: null };
    } catch (error) {
      if (polledToken !== this.token) return;
      streamDeck.logger.warn(`GitHub poll failed: ${messageOf(error)}`);
      next = this.snapshotAfterFailure(error);
    }
    if (polledToken !== this.token) return;
    this.current = next;
    this.notify();
  }

  private currentSearch(): string | null {
    return this.currentViewer === null ? null : ownerSearch(this.currentViewer.login, this.ownerChoices);
  }

  private snapshotAfterFailure(error: unknown): PrSnapshot {
    if (error instanceof GitHubUnauthorizedError) return { kind: "tokenProblem", problem: "expired" };
    if (error instanceof GitHubSsoError) return { kind: "tokenProblem", problem: "sso" };
    if (error instanceof GitHubForbiddenError) return { kind: "tokenProblem", problem: "noAccess" };
    if (error instanceof GitHubRateLimitError) {
      // A reset in the past sets no pause, so the next interval polls as usual.
      if (error.resetMs <= Date.now()) return this.current;
      this.pause(error.resetMs);
      return withIssue(this.current, { kind: "rateLimited", untilMs: error.resetMs });
    }
    return withIssue(this.current, { kind: "offline" });
  }

  private isPaused(): boolean {
    return this.pausedUntilMs !== null && Date.now() < this.pausedUntilMs;
  }

  private pause(untilMs: number): void {
    this.pausedUntilMs = untilMs;
    this.armPauseTimer();
  }

  private armPauseTimer(): void {
    this.clearPauseTimer();
    if (this.pausedUntilMs === null || !this.isVisible) return;
    const delayMs = this.pausedUntilMs - Date.now();
    if (delayMs <= 0) {
      this.pausedUntilMs = null;
      return;
    }
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      this.pausedUntilMs = null;
      void this.pollNow();
    }, delayMs);
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private clearPause(): void {
    this.pausedUntilMs = null;
    this.clearPauseTimer();
  }

  private notify(): void {
    try {
      this.onChange();
    } catch (error) {
      streamDeck.logger.warn(`${REDRAW_LABEL} failed: ${messageOf(error)}`);
    }
  }
}
