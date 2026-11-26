import { GitHubRequestError } from "./errors";
import type { MyPullRequests, PullRequest } from "./types";

const FINISHED_CHECK_STATES = ["SUCCESS", "NEUTRAL", "SKIPPED"] as const;

const HTTP_OK = 200;

type StateCount = { state: string; count: number };

type Node = Record<string, any>;

export function parseMyPullRequests(body: unknown): MyPullRequests {
  const search = (body as { data?: { search?: Node } } | null)?.data?.search;
  if (!search || !Array.isArray(search.nodes) || typeof search.issueCount !== "number") {
    throw new GitHubRequestError(HTTP_OK, "Unexpected GitHub response");
  }
  const nodes: (Node | null)[] = search.nodes;
  const prs = nodes.filter((node): node is Node => typeof node?.number === "number").map(toPullRequest);
  return { prs, totalCount: search.issueCount };
}

function toPullRequest(node: Node): PullRequest {
  const rollup = node.statusCheckRollup ?? null;
  const counts: StateCount[] = [
    ...(rollup?.contexts?.checkRunCountsByState ?? []),
    ...(rollup?.contexts?.statusContextCountsByState ?? []),
  ];
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    createdAt: node.createdAt,
    isDraft: node.isDraft,
    headRefName: node.headRefName,
    baseRefName: node.baseRefName,
    reviewDecision: node.reviewDecision,
    mergeStateStatus: node.mergeStateStatus,
    repository: node.repository.name,
    owner: node.repository.owner.login,
    rollupState: rollup?.state ?? null,
    finishedChecks: sumCounts(counts.filter(({ state }) => (FINISHED_CHECK_STATES as readonly string[]).includes(state))),
    totalChecks: sumCounts(counts),
  };
}

function sumCounts(counts: StateCount[]): number {
  return counts.reduce((total, { count }) => total + count, 0);
}
