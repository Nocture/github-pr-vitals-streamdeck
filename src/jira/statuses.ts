import streamDeck from "@elgato/streamdeck";
import { messageOf } from "../log";
import type { JiraConfig } from "../settings";
import { fetchCloudId, fetchStatuses, JiraUnauthorizedError } from "./client";
import type { JiraStatus } from "./types";

export const JIRA_INTERVAL_MS = 300_000;
export const JIRA_NEW_TICKET_WAIT_MS = 60_000;
export const JIRA_STALE_MS = 3 * JIRA_INTERVAL_MS;

/**
 * The Jira status of the tickets on the keys. One bulk call asks for every ticket, and only one call runs at a time.
 * A refused call forgets the statuses at once. After another failure, they stay until JIRA_STALE_MS after the last answer,
 * and the next call is due after JIRA_NEW_TICKET_WAIT_MS. Forgotten statuses have no answer time.
 */
export class JiraStatuses {
  private config: JiraConfig | null = null;
  private statuses = new Map<string, JiraStatus>();
  private latestTickets: string[] = [];
  private askedTickets = new Set<string>();
  private lastCallMs: number | null = null;
  private lastAnswerMs: number | null = null;
  private nextCallWaitMs = JIRA_INTERVAL_MS;
  private cloud: { host: string; id: string } | null = null;
  private isCalling = false;

  configure(config: JiraConfig | null): void {
    if (isSameConfig(config, this.config)) return;
    this.config = config;
    this.statuses = new Map();
    this.askedTickets = new Set();
    this.lastCallMs = null;
    this.lastAnswerMs = null;
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  // Returns whether a status changed. When the config changed during the call, the new config is asked at once.
  async refresh(tickets: string[], nowMs: number): Promise<boolean> {
    this.latestTickets = [...new Set(tickets)];
    const { config } = this;
    if (config === null || this.isCalling || !this.isDue(nowMs)) return false;
    const isChanged = await this.call(config, nowMs);
    return config === this.config ? isChanged : this.refresh(this.latestTickets, nowMs);
  }

  statusOf(ticket: string): JiraStatus | null {
    return this.statuses.get(ticket) ?? null;
  }

  get updatedMs(): number | null {
    return this.lastAnswerMs;
  }

  private isDue(nowMs: number): boolean {
    if (this.latestTickets.length === 0) return false;
    if (this.lastCallMs === null) return true;
    const waitedMs = nowMs - this.lastCallMs;
    const hasNewTicket = this.latestTickets.some((ticket) => !this.askedTickets.has(ticket));
    return waitedMs >= this.nextCallWaitMs || (hasNewTicket && waitedMs >= JIRA_NEW_TICKET_WAIT_MS);
  }

  // Returns whether a status changed. The answer of a config that is no longer current is dropped.
  private async call(config: JiraConfig, nowMs: number): Promise<boolean> {
    const tickets = this.latestTickets;
    this.isCalling = true;
    this.lastCallMs = nowMs;
    for (const ticket of tickets) this.askedTickets.add(ticket);
    try {
      const statuses = await fetchStatuses(config.credentials, await this.cloudIdOf(config.host), tickets);
      if (config !== this.config) return false;
      const isChanged = !isSameStatuses(statuses, this.statuses);
      this.statuses = statuses;
      this.lastAnswerMs = nowMs;
      this.nextCallWaitMs = JIRA_INTERVAL_MS;
      return isChanged;
    } catch (error) {
      if (config !== this.config) return false;
      streamDeck.logger.warn(`Jira poll failed: ${messageOf(error)}`);
      this.nextCallWaitMs = error instanceof JiraUnauthorizedError ? JIRA_INTERVAL_MS : JIRA_NEW_TICKET_WAIT_MS;
      return this.canKeepStatuses(error, nowMs) ? false : this.forgetStatuses();
    } finally {
      this.isCalling = false;
    }
  }

  private canKeepStatuses(error: unknown, nowMs: number): boolean {
    if (error instanceof JiraUnauthorizedError || this.lastAnswerMs === null) return false;
    return nowMs - this.lastAnswerMs < JIRA_STALE_MS;
  }

  // Returns whether there was a status to forget.
  private forgetStatuses(): boolean {
    const hadStatuses = this.statuses.size > 0;
    this.statuses = new Map();
    this.lastAnswerMs = null;
    return hadStatuses;
  }

  private async cloudIdOf(host: string): Promise<string> {
    if (this.cloud?.host !== host) this.cloud = { host, id: await fetchCloudId(host) };
    return this.cloud.id;
  }
}

function isSameConfig(first: JiraConfig | null, second: JiraConfig | null): boolean {
  if (first === null || second === null) return first === second;
  return (
    first.host === second.host &&
    first.credentials.email === second.credentials.email &&
    first.credentials.token === second.credentials.token &&
    first.projects.join(",") === second.projects.join(",")
  );
}

function isSameStatuses(first: Map<string, JiraStatus>, second: Map<string, JiraStatus>): boolean {
  if (first.size !== second.size) return false;
  for (const [ticket, status] of first) {
    const other = second.get(ticket);
    if (other?.name !== status.name || other.isResolved !== status.isResolved) return false;
  }
  return true;
}
