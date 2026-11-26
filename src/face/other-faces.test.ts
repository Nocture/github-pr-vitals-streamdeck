import { expect, test } from "vitest";
import { svgTexts } from "../test-support";
import { renderBack, renderEmptySlot, renderJiraWindow, renderNoData, renderNothingApproved, renderOverflow, renderTokenFace } from "./other-faces";

test("the overflow key counts the hidden pull requests", () => {
  expect(svgTexts(renderOverflow(7))).toEqual(["+7", "more PRs", "on GitHub"]);
});

test("the empty slot says there is no PR", () => {
  expect(svgTexts(renderEmptySlot())).toEqual(["No PR"]);
});

test("the nothing-approved face says so", () => {
  expect(svgTexts(renderNothingApproved())).toEqual(["Nothing", "approved yet"]);
});

test("the Back face names the list", () => {
  expect(svgTexts(renderBack("deploy"))).toEqual(["Back", "deploy"]);
  expect(svgTexts(renderBack(null))).toEqual(["Back"]);
});

test("the no-data face says there is no data and why", () => {
  expect(svgTexts(renderNoData("paused to 14:05"))).toEqual(["No data", "paused to 14:05"]);
});

test.each([
  ["missing", ["Add a", "token", "press to fix"]],
  ["expired", ["Token", "expired", "press to fix"]],
  ["sso", ["Token", "needs SSO", "press to fix"]],
  ["noAccess", ["Token", "no access", "press to fix"]],
] as const)("each token face names its problem: %s", (face, expected) => {
  expect(svgTexts(renderTokenFace(face))).toEqual(expected);
});

test.each(["expired", "sso", "noAccess"] as const)("a token problem shows an amber key: %s", (face) => {
  expect(renderTokenFace(face)).toContain('stroke="#ffb020"');
});

test.each([
  ["ticket", 3, ["Press again", "to open JIRA", "3s"], "#1868db", "#c9dcff"],
  ["noTicket", 2, ["No JIRA", "ticket", "2s"], "#232325", "#8e8e93"],
  ["noSite", 1, ["Set the", "JIRA site", "1s"], "#232325", "#8e8e93"],
] as const)("the Jira window face says what a second press does and counts down: %s", (kind, secondsLeft, texts, background, countdownColor) => {
  const svg = renderJiraWindow(kind, secondsLeft);
  expect(svgTexts(svg)).toEqual(texts);
  expect(svg).toContain(`<rect x="0" y="0" width="144" height="144" fill="${background}"`);
  expect(svg).toContain(`y="122" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="${countdownColor}">${secondsLeft}s<`);
});
