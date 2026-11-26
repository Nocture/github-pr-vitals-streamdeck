import { BEHIND_PROBLEM_PREFIX, CONFLICTS_PROBLEM, isReadyState, type Pipeline, type Review } from "../prs/derive";
import { cutToWidth, fitText, type FitStep, textWidth } from "./fit-text";
import {
  BLACK, CONFLICTS, CONFLICTS_TEXT, DRAFT, DRAFT_BAND, FAILED, FAILED_DIM, LAVENDER, NEUTRAL, OFF_WHITE, PASSED, PASSED_SHADE, REVIEW, RUNNING, RUNNING_TEXT, RUNNING_TRACK, SOFT, WHITE,
} from "./colors";
import { circle, KEY_SIZE, keySvg, LINE_HEIGHT, path, rect, round1, text, textLines } from "./svg";

export type PrKeyView = {
  label: string;
  isTicketResolved: boolean;
  pipeline: Pipeline;
  finishedShare: number;
  isPulsing: boolean;
  review: Review;
  title: string;
  repo: string;
  repoColor: string;
  problem: string | null;
};

const BAND_HEIGHT = 25;
const LABEL_LEFT = 10;
const DRAFT_LABEL_LEFT = 24;
const DOT_CENTER_X = 14;
const DOT_RADIUS = 5;
const RING_RADIUS = 4;
const RING_WIDTH = 2;
const LABEL_BASELINE = 19;
const LABEL_SIZE = 18;
const LABEL_RIGHT_MARGIN = 10;
const LABEL_TICK_GAP = 4;
const TICK_LEFT = 124;
const TICK_WIDTH = 3.6;
const MIN_FINISHED_SHARE = 0.15;
const STRIPE_SPACING = 16;
const STRIPE_STEP_PER_FRAME = 5;
const STRIPE_SLANT = 25;
const STRIPE_THICKNESS = 8;
const STRIPE_OPACITY = 0.22;
const CHANGES_BACKGROUND = "#2b2326";
const DRAFT_TITLE = "#9a9aa0";
const DRAFT_LABEL = "#e2e2e6";
const NO_CHECKS_BAND = SOFT;
const NO_CHECKS_LABEL = NEUTRAL;

const TITLE_LEFT = 10;
const TITLE_TOP = 27;
const TITLE_WIDTH = 124;
const TITLE_HEIGHT = 93;
const TITLE_SIZES = [26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15];
const TITLE_STEPS: FitStep[] = TITLE_SIZES.map((size) => ({
  size,
  maxLines: Math.floor(TITLE_HEIGHT / (size * LINE_HEIGHT)),
}));

const BOTTOM_BASELINE = 135;
const BOTTOM_SIZE = 14;
const CHIP_TOP = 121;
const CHIP_HEIGHT = 19;
const REPO_WIDTH = 116;
const PROBLEM_WIDTH = 112;
const CHANGES_ASKED = "changes asked";
const CHANGES_ASKED_TEXT = "#ff8fa3";
const REPO_CHIP_OPACITY = 0.4;

type FlashKind = "conflicts" | "behind";
type FlashStyle = { pill: string; ink: string; text: string };

// Even frames show the word on a pill. Odd frames show the word in the text colour.
const FLASH_STYLE: Record<FlashKind, FlashStyle> = {
  conflicts: { pill: CONFLICTS, ink: WHITE, text: CONFLICTS_TEXT },
  behind: { pill: LAVENDER, ink: NEUTRAL, text: LAVENDER },
};

const REVIEW_STYLE: Record<Review, { background: string; title: string }> = {
  approved: { background: REVIEW, title: WHITE },
  behind: { background: REVIEW, title: WHITE },
  conflicts: { background: REVIEW, title: WHITE },
  changes: { background: CHANGES_BACKGROUND, title: OFF_WHITE },
  review: { background: REVIEW, title: OFF_WHITE },
  draft: { background: DRAFT, title: DRAFT_TITLE },
};

function flashKindOf(problem: string | null): FlashKind | null {
  if (problem === CONFLICTS_PROBLEM) return "conflicts";
  if (problem?.startsWith(BEHIND_PROBLEM_PREFIX)) return "behind";
  return null;
}

export function isAnimated(view: PrKeyView): boolean {
  return view.pipeline === "running" || (view.pipeline === "failed" && view.isPulsing) || flashKindOf(view.problem) !== null;
}

export function renderPrKey(view: PrKeyView, frame: number): string {
  const style = REVIEW_STYLE[view.review];
  const isDraft = view.review === "draft";
  const isReady = isReadyState(view.review, view.pipeline);
  const labelColor = labelColorOf(view);
  const labelLeft = isDraft ? DRAFT_LABEL_LEFT : LABEL_LEFT;
  return keySvg(
    rect(0, 0, KEY_SIZE, KEY_SIZE, isReady ? PASSED : style.background) +
      (isDraft ? draftDot(view, frame) : band(view, frame, isReady)) +
      text(bandLabel(view, labelLeft), labelLeft, LABEL_BASELINE, LABEL_SIZE, labelColor) +
      (view.isTicketResolved ? resolvedTick(labelColor) : "") +
      titleBlock(view.title, style.title) +
      bottomRow(view, frame),
  );
}

function labelColorOf(view: PrKeyView): string {
  if (view.review === "draft") return DRAFT_LABEL;
  return view.pipeline === "none" ? NO_CHECKS_LABEL : WHITE;
}

function bandLabel(view: PrKeyView, labelLeft: number): string {
  const labelRight = view.isTicketResolved ? TICK_LEFT - LABEL_TICK_GAP : KEY_SIZE - LABEL_RIGHT_MARGIN;
  return cutToWidth(view.label, labelRight - labelLeft, LABEL_SIZE);
}

function failedColor(view: PrKeyView, frame: number): string {
  return view.isPulsing && frame % 2 === 1 ? FAILED_DIM : FAILED;
}

// A ready PR has a green key, so its passed band takes a darker green to stay visible.
function band(view: PrKeyView, frame: number, isReady: boolean): string {
  if (view.pipeline === "running") return runningBand(view.finishedShare, frame);
  const colors = { passed: isReady ? PASSED_SHADE : PASSED, failed: failedColor(view, frame), none: NO_CHECKS_BAND };
  return rect(0, 0, KEY_SIZE, BAND_HEIGHT, colors[view.pipeline]);
}

function runningBand(finishedShare: number, frame: number): string {
  const end = round1(KEY_SIZE * Math.min(1, Math.max(MIN_FINISHED_SHARE, finishedShare)));
  let stripes = "";
  for (let x = (frame * STRIPE_STEP_PER_FRAME) % STRIPE_SPACING; x + STRIPE_SLANT + STRIPE_THICKNESS <= end; x += STRIPE_SPACING) {
    stripes += path(
      `M${x} ${BAND_HEIGHT} H${x + STRIPE_THICKNESS} L${x + STRIPE_SLANT + STRIPE_THICKNESS} 0 H${x + STRIPE_SLANT} Z`,
      { fill: WHITE, fillOpacity: STRIPE_OPACITY },
    );
  }
  return rect(0, 0, KEY_SIZE, BAND_HEIGHT, RUNNING_TRACK) + rect(0, 0, end, BAND_HEIGHT, RUNNING) + stripes;
}

// A draft has no band. A dot before the label shows the pipeline. A grey ring means no checks.
function draftDot(view: PrKeyView, frame: number): string {
  const centerY = BAND_HEIGHT / 2;
  if (view.pipeline === "none") return circle(DOT_CENTER_X, centerY, RING_RADIUS, "none", { stroke: DRAFT_BAND, strokeWidth: RING_WIDTH });
  const colors = { passed: PASSED, failed: failedColor(view, frame), running: frame % 2 === 1 ? DRAFT_BAND : RUNNING };
  return circle(DOT_CENTER_X, centerY, DOT_RADIUS, colors[view.pipeline]);
}

function resolvedTick(color: string): string {
  return path(`M${TICK_LEFT} ${round1(BAND_HEIGHT / 2 + 0.3)} l4 4.2 l8.5 -9`, { stroke: color, strokeWidth: TICK_WIDTH, isRound: true });
}

function titleBlock(title: string, color: string): string {
  const { size, lines } = fitText(title, TITLE_WIDTH, TITLE_STEPS);
  const blockTop = TITLE_TOP + (TITLE_HEIGHT - size * LINE_HEIGHT * lines.length) / 2;
  return textLines(lines, TITLE_LEFT, blockTop, size, color);
}

function bottomRow(view: PrKeyView, frame: number): string {
  if (view.problem === null) {
    const repo = cutToWidth(view.repo, REPO_WIDTH, BOTTOM_SIZE);
    return (
      rect(9, CHIP_TOP, textWidth(repo, BOTTOM_SIZE) + 10, CHIP_HEIGHT, BLACK, { radius: 5, fillOpacity: REPO_CHIP_OPACITY }) +
      text(repo, 14, BOTTOM_BASELINE, BOTTOM_SIZE, view.repoColor)
    );
  }
  const flashKind = flashKindOf(view.problem);
  if (flashKind !== null) return flashingProblem(view.problem, FLASH_STYLE[flashKind], frame);
  const problemColor = view.problem === CHANGES_ASKED ? CHANGES_ASKED_TEXT : RUNNING_TEXT;
  return (
    circle(14, 130, 5, view.repoColor) +
    text(cutToWidth(view.problem, PROBLEM_WIDTH, BOTTOM_SIZE), 23, BOTTOM_BASELINE, BOTTOM_SIZE, problemColor)
  );
}

function flashingProblem(problem: string, style: FlashStyle, frame: number): string {
  const word = cutToWidth(problem, PROBLEM_WIDTH, BOTTOM_SIZE);
  if (frame % 2 === 1) return text(word, 14, BOTTOM_BASELINE, BOTTOM_SIZE, style.text);
  return rect(9, CHIP_TOP, textWidth(word, BOTTOM_SIZE) + 10, CHIP_HEIGHT, style.pill, { radius: 5 }) + text(word, 14, BOTTOM_BASELINE, BOTTOM_SIZE, style.ink);
}
