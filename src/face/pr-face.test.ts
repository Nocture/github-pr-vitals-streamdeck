import { describe, expect, test } from "vitest";
import { svgTexts } from "../test-support";
import { textWidth } from "./fit-text";
import { round1 } from "./svg";
import { isAnimated, renderPrKey, type PrKeyView } from "./pr-face";

const baseView: PrKeyView = {
  label: "ABC-20415",
  isTicketResolved: false,
  pipeline: "passed",
  finishedShare: 1,
  isPulsing: false,
  review: "review",
  title: "Profile page: avatar upload",
  repo: "billing",
  repoColor: "#a3e635",
  problem: null,
};

function band(color: string): RegExp {
  return new RegExp(`<rect x="0" y="0" width="144" height="25" fill="${color}"`);
}

function titleSize(svg: string, title: string): number {
  const first = title.split(" ")[0];
  const match = svg.match(new RegExp(`font-size="(\\d+)"[^>]*>${first}`));
  return Number(match?.[1]);
}

describe("band", () => {
  test.each([
    ["passed", "#1f8a42"],
    ["failed", "#d0312a"],
    ["none", "#c4c4ca"],
  ] as const)("the band takes the pipeline colour: %s", (pipeline, color) => {
    expect(renderPrKey({ ...baseView, pipeline }, 0)).toMatch(band(color));
  });

  test("a ready PR has a dark green band on its green key", () => {
    expect(renderPrKey({ ...baseView, review: "approved", pipeline: "passed" }, 0)).toMatch(band("#145c2c"));
  });

  test("a running band fills to the finished share and its stripes move", () => {
    const view: PrKeyView = { ...baseView, pipeline: "running", finishedShare: 0.5 };
    expect(renderPrKey(view, 0)).toMatch(/<rect x="0" y="0" width="72" height="25" fill="#c27400"/);
    expect(renderPrKey(view, 0)).not.toBe(renderPrKey(view, 1));
    expect(renderPrKey(view, 0)).toContain('d="M0 25');
  });

  test("a failed band pulses only while it is new", () => {
    expect(renderPrKey({ ...baseView, pipeline: "failed", isPulsing: true }, 1)).toMatch(band("#8f1d16"));
    expect(renderPrKey({ ...baseView, pipeline: "failed", isPulsing: false }, 1)).toMatch(band("#d0312a"));
  });

  test("a draft has no band: a dot in the pipeline colour leads the label", () => {
    const svg = renderPrKey({ ...baseView, review: "draft", pipeline: "passed" }, 0);
    expect(svg).not.toContain('height="25"');
    expect(svg).toContain('<circle cx="14" cy="12.5" r="5" fill="#1f8a42"/>');
    expect(svg).toMatch(/<text x="24" y="19"[^>]*>ABC-20415</);
  });

  test.each([
    ["running", 0, false, "#c27400"],
    ["running", 1, false, "#5c5c63"],
    ["failed", 1, true, "#8f1d16"],
  ] as const)("a draft's dot blinks while running and pulses while newly failed: %s, frame %d", (pipeline, frame, isPulsing, color) => {
    const svg = renderPrKey({ ...baseView, review: "draft", pipeline, isPulsing }, frame);
    expect(svg).toContain(`<circle cx="14" cy="12.5" r="5" fill="${color}"/>`);
  });

  test("a draft keeps a five-digit ticket whole next to the resolved tick", () => {
    const svg = renderPrKey({ ...baseView, review: "draft", label: "ABC-20467", isTicketResolved: true }, 0);
    expect(svgTexts(svg)[0]).toBe("ABC-20467");
  });

  test("a draft without checks has a grey ring in place of the dot", () => {
    const svg = renderPrKey({ ...baseView, review: "draft", pipeline: "none" }, 0);
    expect(svg).toContain('<circle cx="14" cy="12.5" r="4" fill="none" stroke="#5c5c63" stroke-width="2"/>');
  });
});

test.each([
  [0, 21.6],
  [2, 144],
])("the running share is clamped: share %d fills %d", (finishedShare, width) => {
  const svg = renderPrKey({ ...baseView, pipeline: "running", finishedShare }, 0);
  expect(svg).toContain(`<rect x="0" y="0" width="${width}" height="25" fill="#c27400"`);
});

describe("the resolved tick", () => {
  const tick = (color: string) =>
    `<path d="M124 12.8 l4 4.2 l8.5 -9" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;

  test.each([
    ["in review", {}, "#ffffff"],
    ["draft", { review: "draft" }, "#e2e2e6"],
    ["no checks, on the light band", { pipeline: "none" }, "#1c1c1f"],
  ] as const)("a resolved ticket has a tick at the right end of the band, in the label colour: %s", (_name, overrides, color) => {
    const svg = renderPrKey({ ...baseView, ...overrides, isTicketResolved: true }, 0);
    expect(svg).toContain(tick(color));
    expect(svg).toMatch(new RegExp(`fill="${color}">ABC-20415<`));
  });

  test("a ticket that is not resolved has no tick", () => {
    expect(renderPrKey(baseView, 0)).not.toContain("l4 4.2 l8.5 -9");
  });
});

test.each([
  ["ready", { review: "approved", pipeline: "passed" }, "#1f8a42"],
  ["approved, checks still running", { review: "approved", pipeline: "running" }, "#26262a"],
  ["approved, behind", { review: "behind" }, "#26262a"],
  ["approved, conflicts", { review: "conflicts" }, "#26262a"],
  ["changes asked", { review: "changes" }, "#2b2326"],
  ["in review", {}, "#26262a"],
  ["draft", { review: "draft" }, "#131315"],
] as const)("only a ready PR has a coloured background: %s", (_name, overrides, color) => {
  expect(renderPrKey({ ...baseView, ...overrides }, 0)).toContain(`<rect x="0" y="0" width="144" height="144" fill="${color}"`);
});

describe("title", () => {
  test("the title fills the space at the largest size that fits", () => {
    expect(titleSize(renderPrKey({ ...baseView, title: "Fix" }, 0), "Fix")).toBe(26);
    const title = "word ".repeat(18).trim();
    const svg = renderPrKey({ ...baseView, title }, 0);
    expect(titleSize(svg, "word")).toBeLessThan(26);
  });

  test("every title line fits the key", () => {
    const title = "internationalisation ".repeat(5).trim().slice(0, 90);
    const svg = renderPrKey({ ...baseView, title }, 0);
    const lines = svgTexts(svg).filter((line) => !["ABC-20415", "billing"].includes(line));
    const size = titleSize(svg, title.slice(0, 4));
    for (const line of lines) expect(textWidth(line, size)).toBeLessThanOrEqual(124);
  });

  test("a title that does not fit at 15 px is cut with …", () => {
    const svg = renderPrKey({ ...baseView, title: "word ".repeat(200).trim() }, 0);
    const lines = svgTexts(svg).filter((line) => !["ABC-20415", "billing"].includes(line));
    expect(titleSize(svg, "word")).toBe(15);
    expect(lines.at(-1)).toMatch(/…$/);
  });

  test("the title block is centred", () => {
    const svg = renderPrKey({ ...baseView, title: "Fix" }, 0);
    const baseline = 27 + (93 - 29.12) / 2 + 14.56 + 9.1;
    expect(svg).toContain(`y="${round1(baseline)}"`);
  });

  test("escapes special characters and keeps every line inside the key", () => {
    const title = 'Fix <b> & "q" 🚀 in the order list page';
    const svg = renderPrKey({ ...baseView, title }, 0);
    expect(svg).not.toContain("<b>");
    const lines = svgTexts(svg).filter((line) => !["ABC-20415", "billing"].includes(line));
    expect(lines.join(" ")).toBe(title);
    const size = titleSize(svg, "Fix");
    for (const line of lines) expect(textWidth(line, size)).toBeLessThanOrEqual(124);
  });
});

test.each([
  [false, "PLATFORM-…"],
  [true, "PLATFOR…"],
] as const)("a long label is cut to fit before the right margin or the tick: resolved %s", (isTicketResolved, expected) => {
  expect(svgTexts(renderPrKey({ ...baseView, label: "PLATFORM-123456", isTicketResolved }, 0))[0]).toBe(expected);
});

test("a long base branch is cut by characters on one line", () => {
  const svg = renderPrKey({ ...baseView, problem: "behind feature/ABC-20300-invoice-export" }, 0);
  expect(svgTexts(svg)).toContain("behind feature…");
});

test("a problem takes the place of the repo", () => {
  const notice = renderPrKey({ ...baseView, problem: "offline 4m" }, 0);
  expect(svgTexts(notice)).toContain("offline 4m");
  expect(svgTexts(notice)).not.toContain("billing");
  expect(notice).toMatch(/fill="#ffb020">offline 4m</);
  expect(renderPrKey({ ...baseView, problem: "changes asked" }, 0)).toMatch(/fill="#ff8fa3">changes asked</);
});

test.each([
  ["running", { pipeline: "running" }, true],
  ["failed and pulsing", { pipeline: "failed", isPulsing: true }, true],
  ["failed and not pulsing", { pipeline: "failed", isPulsing: false }, false],
  ["draft and running", { pipeline: "running", review: "draft" }, true],
  ["passed", { pipeline: "passed" }, false],
  ["conflicts", { problem: "conflicts" }, true],
  ["behind main", { problem: "behind main" }, true],
  ["changes asked", { problem: "changes asked" }, false],
  ["a notice", { problem: "offline 1m" }, false],
] as const)("animates only while running, pulsing or flashing a problem: %s", (_name, overrides, expected) => {
  expect(isAnimated({ ...baseView, ...overrides })).toBe(expected);
});

describe("a flashing problem", () => {
  test.each([
    ["conflicts", "#b8329e", "#ffffff", "#ff7ae0"],
    ["behind main", "#c9b8ff", "#1c1c1f", "#c9b8ff"],
  ])("%s is a pill on even frames and coloured text on odd frames", (problem, pill, ink, textColor) => {
    const width = round1(textWidth(problem, 14) + 10);
    const view = { ...baseView, problem };
    const even = renderPrKey(view, 0);
    expect(even).toContain(`<rect x="9" y="121" width="${width}" height="19" fill="${pill}" rx="5"`);
    expect(even).toMatch(new RegExp(`fill="${ink}">${problem}<`));
    const odd = renderPrKey(view, 1);
    expect(odd).not.toContain(`height="19" fill="${pill}"`);
    expect(odd).toMatch(new RegExp(`fill="${textColor}">${problem}<`));
  });

  test("a notice does not flash", () => {
    const view = { ...baseView, problem: "offline 1m" };
    expect(renderPrKey(view, 1)).toBe(renderPrKey(view, 0));
  });
});
