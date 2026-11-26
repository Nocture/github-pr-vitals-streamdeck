import type { PollIssue } from "../poller";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h`;
  return `${Math.floor(hours / HOURS_PER_DAY)}d`;
}

export function formatClock(timeMs: number): string {
  const time = new Date(timeMs);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

export function noticeOf(issue: PollIssue | null, updatedMs: number | null, nowMs: number): string | null {
  if (issue === null) return null;
  switch (issue.kind) {
    case "offline":
      return updatedMs === null ? "offline" : `offline ${formatAge(nowMs - updatedMs)}`;
    case "rateLimited":
      return `paused to ${formatClock(issue.untilMs)}`;
  }
}
