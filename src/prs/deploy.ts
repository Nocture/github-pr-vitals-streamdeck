import type { PullRequest } from "../github/types";
import { isReadyState, pipelineOf, reviewOf } from "./derive";

const FALLBACK_DEFAULT_BRANCHES = ["main", "master"];

export const DEPLOYABLE_REVIEWS = ["approved", "behind", "conflicts"];

export function isReady(pr: PullRequest): boolean {
  return isReadyState(reviewOf(pr), pipelineOf(pr));
}

export function isDeployable(pr: PullRequest, defaultBranch: string | undefined): boolean {
  const targetsDefaultBranch =
    defaultBranch === undefined ? FALLBACK_DEFAULT_BRANCHES.includes(pr.baseRefName) : pr.baseRefName === defaultBranch;
  return DEPLOYABLE_REVIEWS.includes(reviewOf(pr)) && targetsDefaultBranch;
}

export function deployList(
  prs: PullRequest[],
  defaultBranchOf: (pr: PullRequest) => string | undefined,
): PullRequest[] {
  const deployable = prs.filter((pr) => isDeployable(pr, defaultBranchOf(pr)));
  return [...deployable.filter(isReady), ...deployable.filter((pr) => !isReady(pr))];
}
