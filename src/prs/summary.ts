import type { PullRequest } from "../github/types";
import { finishedShareOf, pipelineOf } from "./derive";

export type CountKind = "failing" | "conflicts" | "running" | "passed" | "noChecks" | "ready" | "behind";
export type SummaryPipeline = "failing" | "running" | "passed" | "noChecks" | "drafts" | "none";
export type MySummary = {
  open: number;
  ready: number;
  drafts: number;
  failing: number;
  running: number;
  passed: number;
  noChecks: number;
  conflicts: number;
  runningShare: number;
};
export type DeploySummary = {
  approved: number;
  ready: number;
  conflicts: number;
  failing: number;
  behind: number;
  running: number;
  noChecks: number;
  runningShare: number;
  pipeline: SummaryPipeline;
};

const MINE_PROBLEM_KINDS = ["failing", "conflicts", "running"] as const;
const DEPLOY_PROBLEM_KINDS = ["failing", "conflicts", "behind", "running", "noChecks"] as const;

function meanFinishedShare(prs: PullRequest[]): number {
  return prs.length === 0 ? 0 : prs.reduce((sum, pr) => sum + finishedShareOf(pr), 0) / prs.length;
}

function countWhere(prs: PullRequest[], test: (pr: PullRequest) => boolean): number {
  return prs.filter(test).length;
}

function nonZeroCounts<Kind extends CountKind>(counts: Record<Kind, number>, kinds: readonly Kind[]): [Kind, number][] {
  return kinds.filter((kind) => counts[kind] > 0).map((kind) => [kind, counts[kind]]);
}

export function summarizeMine(prs: PullRequest[]): MySummary {
  const ready = prs.filter((pr) => !pr.isDraft);
  const running = ready.filter((pr) => pipelineOf(pr) === "running");
  return {
    open: prs.length,
    ready: ready.length,
    drafts: prs.length - ready.length,
    failing: countWhere(ready, (pr) => pipelineOf(pr) === "failed"),
    running: running.length,
    passed: countWhere(ready, (pr) => pipelineOf(pr) === "passed"),
    noChecks: countWhere(ready, (pr) => pipelineOf(pr) === "none"),
    conflicts: countWhere(ready, (pr) => pr.mergeStateStatus === "DIRTY"),
    runningShare: meanFinishedShare(running),
  };
}

export function deployBucketOf(pr: PullRequest): Exclude<CountKind, "passed"> {
  const pipeline = pipelineOf(pr);
  if (pr.mergeStateStatus === "DIRTY") return "conflicts";
  if (pipeline === "failed") return "failing";
  if (pr.mergeStateStatus === "BEHIND") return "behind";
  if (pipeline === "running") return "running";
  return pipeline === "passed" ? "ready" : "noChecks";
}

function worstPipelineOf(prs: PullRequest[]): SummaryPipeline {
  const pipelines = prs.map(pipelineOf);
  if (pipelines.includes("failed")) return "failing";
  if (pipelines.includes("running")) return "running";
  return pipelines.includes("passed") ? "passed" : "none";
}

export function summarizeDeploy(deployPrs: PullRequest[]): DeploySummary {
  const inBucket = (bucket: ReturnType<typeof deployBucketOf>) =>
    deployPrs.filter((pr) => deployBucketOf(pr) === bucket);
  return {
    approved: deployPrs.length,
    ready: inBucket("ready").length,
    conflicts: inBucket("conflicts").length,
    failing: inBucket("failing").length,
    behind: inBucket("behind").length,
    running: inBucket("running").length,
    noChecks: inBucket("noChecks").length,
    runningShare: meanFinishedShare(inBucket("running")),
    pipeline: worstPipelineOf(deployPrs),
  };
}

export function minePipeline(summary: MySummary): SummaryPipeline {
  if (summary.ready === 0 && summary.drafts > 0) return "drafts";
  if (summary.failing > 0) return "failing";
  if (summary.running > 0) return "running";
  return summary.passed > 0 ? "passed" : "noChecks";
}

export function mineProblems(summary: MySummary): [CountKind, number][] {
  return nonZeroCounts(summary, MINE_PROBLEM_KINDS);
}

export function deployProblems(summary: DeploySummary): [CountKind, number][] {
  return nonZeroCounts(summary, DEPLOY_PROBLEM_KINDS);
}
