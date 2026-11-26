import { expect, test } from "vitest";
import { githubMark, placePath } from "./github-mark";

test("places the mark without a transform", () => {
  const mark = githubMark(130, 12.5, 16, "#ffffff");
  expect(mark.startsWith('<path d="M130 4.5')).toBe(true);
  expect(mark).not.toContain("transform");
});

test("scales relative numbers but not arc flags", () => {
  expect(placePath("M0 0a2 2 0 0 1 4 0", 2, 10, 10)).toBe("M10 10 a4 4 0 0 1 8 0");
});
