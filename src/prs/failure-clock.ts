import type { PullRequest } from "../github/types";
import { pipelineOf, prIdentity } from "./derive";

export const PULSE_MS = 300_000;

export class FailureClock {
  private readonly firstSeenFailedMs = new Map<string, number>();

  update(prs: PullRequest[], nowMs: number): void {
    const failedIdentities = new Set<string>();
    for (const pr of prs) {
      if (pipelineOf(pr) !== "failed") continue;
      const identity = prIdentity(pr);
      failedIdentities.add(identity);
      if (!this.firstSeenFailedMs.has(identity)) this.firstSeenFailedMs.set(identity, nowMs);
    }
    for (const identity of this.firstSeenFailedMs.keys()) {
      if (!failedIdentities.has(identity)) this.firstSeenFailedMs.delete(identity);
    }
  }

  isPulsing(pr: PullRequest, nowMs: number): boolean {
    const seenMs = this.firstSeenFailedMs.get(prIdentity(pr));
    return pipelineOf(pr) === "failed" && seenMs !== undefined && nowMs - seenMs < PULSE_MS;
  }
}
