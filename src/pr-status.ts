import streamDeck from "@elgato/streamdeck";
import type { PrKeyView } from "./face/pr-face";
import { FrameTimer } from "./frame-timer";
import { type OwnerOption, ownerOptions } from "./github/owners";
import type { PullRequest } from "./github/types";
import { JiraStatuses } from "./jira/statuses";
import { REDRAW_LABEL, warnOnFailure } from "./log";
import { Poller, type PrSnapshot } from "./poller";
import { finishedShareOf, leadOf, parseJiraProjects, pipelineOf, problemOf, reviewOf } from "./prs/derive";
import { DefaultBranches } from "./prs/default-branches";
import { DEPLOYABLE_REVIEWS, deployList } from "./prs/deploy";
import { FailureClock } from "./prs/failure-clock";
import { noticeOf } from "./prs/notices";
import type { PropertyInspectorHost } from "./property-inspector";
import { githubTokenOf, type GlobalSettings, jiraConfigOf } from "./settings";
import { SettingsStore } from "./settings-store";

/** A set of keys that shows the pull requests, for example the keys of one action. */
export interface StatusView {
  hasVisibleKeys(): boolean;
  isAnimating(): boolean;
  redraw(): Promise<void>;
}

export const APPEAR_SETTLE_MS = 50;
const JIRA_REFRESH_LABEL = "Refreshing the Jira statuses";

/** The state that all keys share: the settings, the pull requests, the Jira statuses, the repo colours and the animation frame. */
export class PrStatus implements PropertyInspectorHost {
  private readonly views: StatusView[] = [];
  private readonly failureClock = new FailureClock();
  private readonly frames = new FrameTimer(() => void warnOnFailure(this.redrawAll(), REDRAW_LABEL));
  private readonly defaultBranches = new DefaultBranches();
  private readonly jiraStatuses = new JiraStatuses();
  private readonly poller = new Poller(() => this.snapshotChanged());
  private readonly store = new SettingsStore(() => this.settingsChanged());
  private appearTimer: ReturnType<typeof setTimeout> | null = null;

  addView(view: StatusView): void {
    this.views.push(view);
  }

  get settings(): GlobalSettings {
    return this.store.settings;
  }

  get snapshot(): PrSnapshot {
    return this.poller.snapshot;
  }

  get frame(): number {
    return this.frames.frame;
  }

  isPulsing(pr: PullRequest): boolean {
    return this.failureClock.isPulsing(pr, Date.now());
  }

  lastUpdateMs(): number | null {
    return this.snapshot.kind === "ready" ? this.snapshot.updatedMs : null;
  }

  lastJiraUpdateMs(): number | null {
    return this.jiraStatuses.updatedMs;
  }

  isJiraConfigured(): boolean {
    return this.jiraStatuses.isConfigured;
  }

  async setRepoColor(repo: string, color: string): Promise<void> {
    if (this.store.setRepoColor(repo, color)) await warnOnFailure(this.redrawAll(), REDRAW_LABEL);
  }

  ownerOptions(): OwnerOption[] {
    const { viewer } = this.poller;
    return viewer === null ? [] : ownerOptions(viewer, this.poller.seenOwners, this.store.ownerChoices);
  }

  async setOwnerShown(login: string, isShown: boolean): Promise<void> {
    const isKnownOwner = this.ownerOptions().some((option) => option.login === login);
    if (isKnownOwner && this.store.setOwnerShown(login, isShown)) this.poller.setOwnerChoices(this.store.ownerChoices);
  }

  deployPrs(): PullRequest[] {
    const { snapshot } = this;
    if (snapshot.kind !== "ready") return [];
    return deployList(snapshot.prs, (pr) => this.defaultBranches.branchOf(pr.owner, pr.repository));
  }

  ticketOf(pr: PullRequest): string | null {
    return leadOf(pr, this.jiraProjects).ticket;
  }

  viewOf(pr: PullRequest): PrKeyView {
    const { ticket, title } = leadOf(pr, this.jiraProjects);
    return {
      label: ticket ?? `#${pr.number}`,
      isTicketResolved: this.isResolved(ticket),
      pipeline: pipelineOf(pr),
      finishedShare: finishedShareOf(pr),
      isPulsing: this.isPulsing(pr),
      review: reviewOf(pr),
      title,
      repo: pr.repository,
      repoColor: this.store.repoColor(pr.repository),
      problem: this.noticeOfSnapshot() ?? problemOf(pr),
    };
  }

  private isResolved(ticket: string | null): boolean {
    return ticket !== null && this.jiraStatuses.statusOf(ticket)?.isResolved === true;
  }

  private noticeOfSnapshot(): string | null {
    const { snapshot } = this;
    return snapshot.kind === "ready" ? noticeOf(snapshot.issue, snapshot.updatedMs, Date.now()) : null;
  }

  async start(): Promise<void> {
    streamDeck.system.onSystemDidWakeUp(() => void this.poller.pollNow());
    await this.store.start();
  }

  // Keys that appear within APPEAR_SETTLE_MS share one redraw.
  keysChanged(): void {
    this.poller.setVisible(this.views.some((view) => view.hasVisibleKeys()));
    if (this.appearTimer !== null) return;
    this.appearTimer = setTimeout(() => {
      this.appearTimer = null;
      void warnOnFailure(this.redrawAll(), REDRAW_LABEL);
    }, APPEAR_SETTLE_MS);
  }

  async redrawAll(): Promise<void> {
    for (const view of this.views) await warnOnFailure(view.redraw(), REDRAW_LABEL);
    this.frames.setActive(this.views.some((view) => view.isAnimating()));
  }

  private get jiraProjects(): string[] {
    return parseJiraProjects(this.store.settings.jiraProjects);
  }

  private settingsChanged(): void {
    const token = githubTokenOf(this.store.settings);
    this.defaultBranches.useToken(token);
    this.poller.setToken(token);
    this.poller.setOwnerChoices(this.store.ownerChoices);
    this.jiraStatuses.configure(jiraConfigOf(this.store.settings));
    void warnOnFailure(this.redrawAll(), REDRAW_LABEL);
    void warnOnFailure(this.refreshJiraStatuses(), JIRA_REFRESH_LABEL);
  }

  private snapshotChanged(): void {
    const snapshot = this.poller.snapshot;
    if (snapshot.kind === "ready") {
      this.failureClock.update(snapshot.prs, Date.now());
      this.store.colorNewRepos(snapshot.prs.map((pr) => pr.repository));
      void warnOnFailure(this.loadDefaultBranches(snapshot.prs), "Loading the default branches");
      void warnOnFailure(this.refreshJiraStatuses(), JIRA_REFRESH_LABEL);
    }
    void warnOnFailure(this.redrawAll(), REDRAW_LABEL);
  }

  // The My PRs list holds every Deploy PR too, so its tickets are all the tickets on the keys.
  private async refreshJiraStatuses(): Promise<void> {
    const { snapshot } = this;
    if (snapshot.kind !== "ready") return;
    const tickets = snapshot.prs.map((pr) => this.ticketOf(pr)).filter((ticket) => ticket !== null);
    if (await this.jiraStatuses.refresh(tickets, Date.now())) await warnOnFailure(this.redrawAll(), REDRAW_LABEL);
  }

  private async loadDefaultBranches(prs: PullRequest[]): Promise<void> {
    const token = githubTokenOf(this.store.settings);
    if (token === null) return;
    const candidates = prs.filter((pr) => DEPLOYABLE_REVIEWS.includes(reviewOf(pr)));
    const repos = candidates.map((pr) => ({ owner: pr.owner, repo: pr.repository }));
    if (await this.defaultBranches.load(token, repos, Date.now())) {
      await warnOnFailure(this.redrawAll(), REDRAW_LABEL);
    }
  }
}
