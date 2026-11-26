type RollupState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  mergeStateStatus: string; // BEHIND, DIRTY, CLEAN, BLOCKED, UNKNOWN, …
  repository: string;
  owner: string;
  rollupState: RollupState | null; // null: no checks on the last commit
  finishedChecks: number;
  totalChecks: number;
};

export type Viewer = { login: string; organizations: string[] };

export type TokenStatus = { login: string; remaining: number; limit: number };

export type MyPullRequests = { prs: PullRequest[]; totalCount: number }; // totalCount: the search's issueCount
