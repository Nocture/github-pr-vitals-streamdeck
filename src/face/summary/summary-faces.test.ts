import { describe, expect, test } from "vitest";
import type { PullRequest } from "../../github/types";
import { summarizeDeploy, summarizeMine } from "../../prs/summary";
import { textWidth } from "../fit-text";
import { KEY_SIZE } from "../svg";
import { pullRequest, svgTexts } from "../../test-support";
import { TOKEN_FACES, type TokenFace } from "../other-faces";
import { renderSummaryLoading, renderSummaryStale, renderSummaryToken } from "./connection";
import { isSummaryAnimated, renderSummary, summaryStyleOf, type SummaryData } from "./index";
import { SUMMARY_MIN_TEXT } from "./parts";

function many(count: number, overrides: Partial<PullRequest> = {}): PullRequest[] {
  return Array.from({ length: count }, (_, index) => pullRequest({ number: index + 1, ...overrides }));
}

const failing = { rollupState: "FAILURE", mergeStateStatus: "CLEAN" } as const;
const passed = { rollupState: "SUCCESS", finishedChecks: 10, totalChecks: 10, mergeStateStatus: "CLEAN" } as const;
const busyPrs = [
  pullRequest(failing),
  ...many(3, { rollupState: "PENDING", finishedChecks: 2, totalChecks: 5 }),
  pullRequest({ rollupState: "PENDING", finishedChecks: 4, totalChecks: 5 }),
  ...many(7, passed),
  ...many(3, { ...passed, mergeStateStatus: "DIRTY" }),
  pullRequest({ rollupState: null, finishedChecks: 0, totalChecks: 0 }),
  ...many(18, { isDraft: true }),
];
const busy: SummaryData = { kind: "mine", summary: summarizeMine(busyPrs) };

function mine(prs: PullRequest[]): SummaryData {
  return { kind: "mine", summary: summarizeMine(prs) };
}

function deploy(prs: PullRequest[]): SummaryData {
  return { kind: "deploy", summary: summarizeDeploy(prs) };
}

function firstFill(svg: string): string {
  return /<rect [^>]*fill="(#[0-9a-f]{6})"/.exec(svg)![1];
}

describe("Signal My PRs", () => {
  test("takes the colour of the first problem and counts it", () => {
    const frame0 = renderSummary(busy,"signal", 0);
    expect(firstFill(frame0)).toBe("#d0312a");
    expect(firstFill(renderSummary(busy,"signal", 1))).toBe("#8f1d16");
    expect(svgTexts(frame0)).toEqual(["My PRs", "34", "1", "failing", "3", "4"]);
  });

  test("is grey and says all green without problems", () => {
    const svg = renderSummary(mine(many(3, passed)), "signal", 0);
    expect(firstFill(svg)).toBe("#26262a");
    expect(svgTexts(svg)).toEqual(["My PRs", "3", "3", "all green"]);
    expect(svg).toContain('fill="#34c759">all green');
  });

  test("is black with only drafts", () => {
    const svg = renderSummary(mine(many(2, { isDraft: true })), "signal", 0);
    expect(firstFill(svg)).toBe("#131315");
    expect(svgTexts(svg)).toContain("drafts only");
  });

  test("is grey and says 0 no PRs without open PRs", () => {
    const svg = renderSummary(mine([]), "signal", 0);
    expect(firstFill(svg)).toBe("#26262a");
    expect(svgTexts(svg)).toEqual(["My PRs", "0", "0", "no PRs"]);
  });
});

describe("Signal Deploy", () => {
  test("is green with a ready PR and lists every problem in chips", () => {
    const prs = [...many(3, passed), pullRequest({ ...failing }), pullRequest({ ...passed, mergeStateStatus: "DIRTY" })];
    const svg = renderSummary(deploy(prs), "signal", 0);
    expect(firstFill(svg)).toBe("#1f8a42");
    expect(svgTexts(svg)).toEqual(["Deploy", "5", "3", "ready", "1", "1"]);
  });

  test("says 0 approved when nothing is approved", () => {
    const svg = renderSummary(deploy([]), "signal", 0);
    expect(svgTexts(svg)).toEqual(["Deploy", "0", "approved"]);
  });

  test("takes a darker band shade when the band has the key's colour", () => {
    const svg = renderSummary(deploy(many(2, passed)), "signal", 0);
    expect(svg).toContain('fill="#145c2c"');
  });

  test("takes the neutral band when the band and the key would both show no checks", () => {
    const svg = renderSummary(deploy(many(2, { rollupState: null, finishedChecks: 0, totalChecks: 0, mergeStateStatus: "CLEAN" })), "signal", 0);
    expect(firstFill(svg)).toBe("#4a4a50");
    expect(svg).toContain('<rect x="0" y="0" width="144" height="25" fill="#36363c"/>');
  });
});

test.each(["scoreboard", "ledger"] as const)("the ready count sits on green, as a ready PR key does: %s", (style) => {
  const svg = renderSummary(deploy([...many(2, passed), pullRequest(failing)]), style, 0);
  expect(svg).toContain('fill="#1f8a42"');
});

describe("connection faces", () => {
  test("the loading face lights one dot per frame", () => {
    for (const frame of [0, 1, 2, 3]) {
      const svg = renderSummaryLoading("Deploy", frame);
      const lit = [...svg.matchAll(/<circle cx="(\d+)"[^>]*fill="#ffffff"/g)].map(([, x]) => x);
      expect(lit).toEqual([["52", "72", "92"][frame % 3]]);
    }
    expect(svgTexts(renderSummaryLoading("Deploy", 0))).toEqual(["Deploy", "Loading"]);
  });

  test.each([
    ["missing", ["Add a", "token"]],
    ["expired", ["Token", "expired"]],
    ["sso", ["Token", "needs SSO"]],
    ["noAccess", ["Token", "no access"]],
  ] as const)("the %s token face names its problem", (face, lines) => {
    expect(svgTexts(renderSummaryToken("My PRs", face))).toEqual(["My PRs", ...lines]);
  });

  test("a stale face dims the last face and names the reason", () => {
    const last = renderSummary(busy,"signal", 0);
    const offline = renderSummaryStale(last, "My PRs", { kind: "offline", text: "offline 4m" });
    expect(offline).toContain('<g opacity="0.4">');
    expect(offline.match(/<svg/g)).toHaveLength(1);
    expect(svgTexts(offline).slice(-1)).toEqual(["offline 4m"]);
    const paused = renderSummaryStale(last, "My PRs", { kind: "paused", untilText: "until 14:05" });
    expect(svgTexts(paused).slice(-1)).toEqual(["until 14:05"]);
  });
});

test("connection faces keep the approved text positions", () => {
  const baselineOf = (svg: string, content: string) => new RegExp(`y="([\\d.]+)"[^>]*>${content}<`).exec(svg)![1];
  const last = renderSummary(busy,"signal", 0);
  const loading = renderSummaryLoading("My PRs", 0);
  const token = renderSummaryToken("My PRs", "expired");
  const offline = renderSummaryStale(last, "My PRs", { kind: "offline", text: "offline 4m" });
  const paused = renderSummaryStale(last, "My PRs", { kind: "paused", untilText: "until 14:05" });
  expect(baselineOf(loading, "Loading")).toBe("118");
  expect([baselineOf(token, "Token"), baselineOf(token, "expired")]).toEqual(["104", "128"]);
  expect(baselineOf(offline, "offline 4m")).toBe("134");
  expect(baselineOf(paused, "until 14:05")).toBe("135");
});

test.each([
  ["busy", busy, true],
  ["all green", mine(many(3, passed)), false],
  ["drafts only", mine(many(2, { isDraft: true })), false],
  ["Deploy running", deploy(many(2, { rollupState: "PENDING", mergeStateStatus: "CLEAN" })), true],
  ["Deploy nothing approved", deploy([]), false],
])("animates only while something fails or runs: %s", (_name, data, expected) => {
  expect(isSummaryAnimated(data)).toBe(expected);
});

describe("Scoreboard", () => {
  test("My PRs lights only tiles above 0", () => {
    const svg = renderSummary(mine(many(3, passed)), "scoreboard", 0);
    expect(svg.match(/<rect [^>]*fill="#1f8a42"/g)).toHaveLength(2);
    expect(svg.match(/fill="#232327" rx="6"/g)).toHaveLength(3);
    expect(svgTexts(svg)).toEqual(["My PRs", "3", "0", "0", "0"]);
  });

  test("Deploy shows the failing count in the pipeline tile, else the running count", () => {
    const failingAndRunning = deploy([
      ...many(2, failing),
      pullRequest({ rollupState: "PENDING", finishedChecks: 3, totalChecks: 10, mergeStateStatus: "CLEAN" }),
    ]);
    expect(svgTexts(renderSummary(failingAndRunning, "scoreboard", 0))).toEqual(["Deploy", "0", "0", "0", "2"]);
    const running = deploy(many(3, { rollupState: "PENDING", finishedChecks: 3, totalChecks: 10, mergeStateStatus: "CLEAN" }));
    expect(svgTexts(renderSummary(running, "scoreboard", 0))).toEqual(["Deploy", "0", "0", "0", "3"]);
  });
});

describe("Ledger", () => {
  test("My PRs lists the problems in rows", () => {
    expect(svgTexts(renderSummary(busy,"ledger", 0))).toEqual(["My PRs", "34", "1", "failing", "3", "conflicts", "4", "running"]);
  });

  test("My PRs without open PRs shows one quiet row", () => {
    const svg = renderSummary(mine([]), "ledger", 0);
    expect(svgTexts(svg)).toEqual(["My PRs", "0", "0", "open"]);
    expect(svg).toContain('fill="#2c2c31" rx="6"');
  });

  test("My PRs without problems lists passed, no checks and drafts", () => {
    const prs = [...many(3, passed), pullRequest({ rollupState: null, finishedChecks: 0, totalChecks: 0 }), ...many(5, { isDraft: true })];
    expect(svgTexts(renderSummary(mine(prs), "ledger", 0))).toEqual(["My PRs", "9", "3", "passed", "1", "no checks", "5", "drafts"]);
  });

  test("Deploy folds the rest into one other row", () => {
    const prs = [
      pullRequest({ ...passed }),
      pullRequest({ ...failing }),
      pullRequest({ ...passed, mergeStateStatus: "BEHIND" }),
      pullRequest({ rollupState: "PENDING", finishedChecks: 3, totalChecks: 10, mergeStateStatus: "CLEAN" }),
    ];
    expect(svgTexts(renderSummary(deploy(prs), "ledger", 0))).toEqual(["Deploy", "4", "1", "ready", "1", "failing", "2", "other"]);
  });
});

const ALL_AT_120_MINE: SummaryData = {
  kind: "mine",
  summary: { open: 120, ready: 120, drafts: 120, failing: 120, running: 120, passed: 120, noChecks: 120, conflicts: 120, runningShare: 0.5 },
};
const ALL_AT_120_DEPLOY: SummaryData = {
  kind: "deploy",
  summary: {
    approved: 120,
    ready: 120,
    conflicts: 120,
    failing: 120,
    behind: 120,
    running: 120,
    noChecks: 120,
    runningShare: 0.5,
    pipeline: "failing",
  },
};
const pending = { rollupState: "PENDING", finishedChecks: 4, totalChecks: 5, mergeStateStatus: "CLEAN" } as const;
const summariesUnderTest: [string, SummaryData][] = [
  ["busy", busy],
  ["conflicts only", mine(many(2, { ...passed, mergeStateStatus: "DIRTY" }))],
  ["running", mine(many(2, pending))],
  ["all green", mine(many(3, passed))],
  ["only drafts", mine(many(2, { isDraft: true }))],
  ["no open PRs", mine([])],
  ["Deploy ready", deploy(many(2, passed))],
  ["Deploy one ready", deploy(many(1, passed))],
  ["Deploy approved and blocked", deploy([...many(2, { ...passed, mergeStateStatus: "BEHIND" }), pullRequest({ ...failing })])],
  ["Deploy approved and running", deploy(many(2, pending))],
  ["Deploy nothing approved", deploy([])],
  ["mine, every count at 120", ALL_AT_120_MINE],
  ["Deploy, every count at 120", ALL_AT_120_DEPLOY],
];

const TEXT_ELEMENT = /<text x="([\d.-]+)" y="[\d.-]+" text-anchor="(\w+)" font-family="Arial" font-size="(\d+)"[^>]*>([^<]*)<\/text>/g;

function expectTextFitsKey(face: string): void {
  for (const [, x, anchor, size, content] of face.matchAll(TEXT_ELEMENT)) {
    const width = textWidth(content, Number(size));
    const left = anchor === "middle" ? Number(x) - width / 2 : anchor === "end" ? Number(x) - width : Number(x);
    expect(Number(size), content).toBeGreaterThanOrEqual(SUMMARY_MIN_TEXT);
    expect(left, content).toBeGreaterThanOrEqual(0);
    expect(left + width, content).toBeLessThanOrEqual(KEY_SIZE);
  }
}

test.each(["scoreboard", "signal", "ledger"] as const)("every %s face keeps its text at 18 px or more and inside the key", (style) => {
  const faces = summariesUnderTest.flatMap(([, data]) => [0, 1].map((frame) => renderSummary(data, style, frame)));
  for (const face of faces) expectTextFitsKey(face);
});

test("every connection face keeps its text at 18 px or more and inside the key", () => {
  const last = renderSummary(busy,"signal", 0);
  const loading = renderSummaryLoading("My PRs", 0);
  const faces = [
    loading,
    ...(Object.keys(TOKEN_FACES) as TokenFace[]).map((face) => renderSummaryToken("Deploy", face)),
    renderSummaryStale(last, "My PRs", { kind: "paused", untilText: "until 14:05" }),
    renderSummaryStale(last, "My PRs", { kind: "offline", text: "offline 59m" }),
    renderSummaryStale(loading, "My PRs", { kind: "offline", text: "offline" }),
  ];
  for (const face of faces) expectTextFitsKey(face);
});

test("unknown summary styles give the key's own default", () => {
  expect(summaryStyleOf("ledger", "mine")).toBe("ledger");
  expect(summaryStyleOf("neon", "deploy")).toBe("signal");
  expect(summaryStyleOf(undefined, "mine")).toBe("scoreboard");
});
