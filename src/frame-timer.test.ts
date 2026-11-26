import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRAME_MS, FrameTimer } from "./frame-timer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("the frame timer ticks only while active", () => {
  const onFrame = vi.fn();
  const timer = new FrameTimer(onFrame);

  timer.setActive(true);
  vi.advanceTimersByTime(2 * FRAME_MS);
  expect(onFrame).toHaveBeenCalledTimes(2);
  expect(timer.frame).toBe(2);

  timer.setActive(false);
  vi.advanceTimersByTime(2 * FRAME_MS);
  expect(onFrame).toHaveBeenCalledTimes(2);
});

test("activating twice does not start a second interval", () => {
  const onFrame = vi.fn();
  const timer = new FrameTimer(onFrame);

  timer.setActive(true);
  timer.setActive(true);
  vi.advanceTimersByTime(2 * FRAME_MS);

  expect(onFrame).toHaveBeenCalledTimes(2);
});

test("the frame count stays when the timer stops", () => {
  const timer = new FrameTimer(vi.fn());

  timer.setActive(true);
  vi.advanceTimersByTime(3 * FRAME_MS);
  timer.setActive(false);

  expect(timer.frame).toBe(3);
});
