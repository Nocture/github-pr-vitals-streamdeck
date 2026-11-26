import type { PullRequest } from "../github/types";

export type Pipeline = "passed" | "running" | "failed" | "none";
export type Review = "approved" | "behind" | "conflicts" | "changes" | "review" | "draft";
type Lead = { ticket: string | null; title: string };

export const CONFLICTS_PROBLEM = "conflicts";
export const BEHIND_PROBLEM_PREFIX = "behind ";

const TITLE_TICKET = /^\s*([A-Z][A-Z0-9]+-\d+)\b[\s:–-]*/;
const BRANCH_TICKET = /^([A-Za-z][A-Za-z0-9]+-\d+)(?!\d)/;

export function pipelineOf(pr: PullRequest): Pipeline {
  switch (pr.rollupState) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "ERROR":
      return "failed";
    case "PENDING":
    case "EXPECTED":
      return "running";
    default:
      return "none";
  }
}

export function reviewOf(pr: PullRequest): Review {
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes";
  if (pr.reviewDecision === "APPROVED") {
    if (pr.mergeStateStatus === "BEHIND") return "behind";
    if (pr.mergeStateStatus === "DIRTY") return "conflicts";
    return "approved";
  }
  return "review";
}

// Ready to deploy: approved, up to date, without conflicts, and every check passed.
export function isReadyState(review: Review, pipeline: Pipeline): boolean {
  return review === "approved" && pipeline === "passed";
}

export function finishedShareOf(pr: PullRequest): number {
  return pr.totalChecks === 0 ? 0 : pr.finishedChecks / pr.totalChecks;
}

export function parseJiraProjects(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((project) => project.trim().toUpperCase())
    .filter((project) => project !== "");
}

function projectOf(ticket: string): string {
  return ticket.slice(0, ticket.lastIndexOf("-"));
}

export function leadOf(pr: PullRequest, jiraProjects: string[]): Lead {
  const fromTitle = TITLE_TICKET.exec(pr.title);
  if (fromTitle && jiraProjects.includes(projectOf(fromTitle[1]))) {
    const rest = pr.title.slice(fromTitle[0].length);
    return { ticket: fromTitle[1], title: rest === "" ? pr.title : rest };
  }
  const fromBranch = BRANCH_TICKET.exec(pr.headRefName);
  if (fromBranch) {
    const ticket = fromBranch[1].toUpperCase();
    if (jiraProjects.includes(projectOf(ticket))) return { ticket, title: pr.title };
  }
  return { ticket: null, title: pr.title };
}

export function problemOf(pr: PullRequest): string | null {
  const review = reviewOf(pr);
  if (review === "behind") return `${BEHIND_PROBLEM_PREFIX}${pr.baseRefName}`;
  if (review === "conflicts") return CONFLICTS_PROBLEM;
  if (review === "changes") return "changes asked";
  if (!pr.isDraft && pr.mergeStateStatus === "DIRTY") return CONFLICTS_PROBLEM;
  return null;
}

export function compareCodeUnits(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

export function sortMyPrs(prs: PullRequest[]): PullRequest[] {
  return [...prs].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      compareCodeUnits(a.repository, b.repository) ||
      a.number - b.number,
  );
}

export function prIdentity(pr: PullRequest): string {
  return `${pr.owner}/${pr.repository}#${pr.number}`;
}
