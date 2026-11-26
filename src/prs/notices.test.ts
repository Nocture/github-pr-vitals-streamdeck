import { expect, test } from "vitest";
import { formatAge, formatClock, noticeOf } from "./notices";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

test.each([
  [0, "0m"],
  [-MINUTE_MS, "0m"],
  [59 * MINUTE_MS + 59_000, "59m"],
  [HOUR_MS, "1h"],
  [25 * HOUR_MS, "1d"],
])("formats the age of the data: %d ms is %s", (ms, expected) => {
  expect(formatAge(ms)).toBe(expected);
});

test("formats a time of day on a 24-hour clock", () => {
  expect(formatClock(new Date(2026, 10, 25, 9, 5).getTime())).toBe("09:05");
});

test("names the issue in a short notice", () => {
  const nowMs = new Date(2026, 10, 25, 10, 4).getTime();
  expect(noticeOf({ kind: "offline" }, nowMs - 4 * MINUTE_MS, nowMs)).toBe("offline 4m");
  expect(noticeOf({ kind: "offline" }, null, nowMs)).toBe("offline");
  expect(noticeOf({ kind: "rateLimited", untilMs: new Date(2026, 10, 25, 14, 5).getTime() }, nowMs, nowMs)).toBe("paused to 14:05");
  expect(noticeOf(null, nowMs, nowMs)).toBeNull();
});
