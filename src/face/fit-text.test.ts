import { expect, test } from "vitest";
import { fitText, textWidth } from "./fit-text";

const WIDTH = 132;
const LONG_NAME = "Dark mode - unreadable labels in the night theme of the settings screen";

// Arial Bold advances, in 1/2048 em: S 1366, t 682, o p n g 1251 each, i 569, … 2048. The sum is 10920.
test("measures text with the widths of Arial Bold", () => {
  expect(textWidth("Stopping…", 24)).toBeCloseTo((10920 / 2048) * 24, 1);
});

test("fits a short text on one line at the first size", () => {
  expect(fitText("Standup", WIDTH, [{ size: 21, maxLines: 3 }])).toEqual({ size: 21, lines: ["Standup"] });
});

test("moves to the next size when the text needs more lines", () => {
  const steps = [{ size: 21, maxLines: 3 }, { size: 18, maxLines: 3 }, { size: 16, maxLines: 4 }];
  const fitted = fitText("Dark mode - unreadable labels in the night theme", WIDTH, steps);
  expect(fitted.size).toBe(16);
  expect(fitted.lines.join(" ")).toBe("Dark mode - unreadable labels in the night theme");
});

test("cuts the last line with … at the last size", () => {
  const fitted = fitText(LONG_NAME, WIDTH, [{ size: 16, maxLines: 2 }]);
  expect(fitted.lines).toHaveLength(2);
  expect(fitted.lines[1].endsWith("…")).toBe(true);
  expect(textWidth(fitted.lines[1], 16)).toBeLessThanOrEqual(WIDTH);
});

test("breaks a word that is wider than a line", () => {
  const fitted = fitText("Internationalisation", WIDTH, [{ size: 36, maxLines: 3 }]);
  expect(fitted.lines.length).toBeGreaterThan(1);
  expect(fitted.lines.join("")).toBe("Internationalisation");
  for (const line of fitted.lines) expect(textWidth(line, 36)).toBeLessThanOrEqual(WIDTH);
});

test("returns no lines for an empty text", () => {
  expect(fitText("   ", WIDTH, [{ size: 21, maxLines: 3 }])).toEqual({ size: 21, lines: [] });
});

// Segoe UI Emoji draws an emoji 1.373 em wide, wider than any letter.
test("counts an unknown character at least as wide as an emoji", () => {
  expect(textWidth("😀", 10)).toBeGreaterThanOrEqual(13.73);
});

test("squeezes spaces", () => {
  expect(fitText("  Code   review ", WIDTH, [{ size: 21, maxLines: 3 }]).lines.join(" ")).toBe("Code review");
});
