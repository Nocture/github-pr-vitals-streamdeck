import type { CountKind, SummaryPipeline } from "../../prs/summary";
import {
  BEHIND_AREA,
  BLACK,
  CONFLICTS,
  CONFLICTS_TEXT,
  DRAFT_BAND,
  DRAFT_TEXT,
  FAILED,
  FAILED_DIM,
  FAILING_TEXT,
  LAVENDER,
  NEUTRAL,
  NEUTRAL_BAND,
  NO_CHECKS,
  NO_CHECKS_TEXT,
  PASSED,
  PASSED_TEXT,
  RUNNING,
  RUNNING_TEXT,
  RUNNING_TRACK,
  WHITE,
} from "../colors";
import { textWidth } from "../fit-text";
import { githubMark } from "../github-mark";
import { circle, path, rect, round1, text } from "../svg";

export type FaceKind = CountKind | "drafts" | "open";
type Point = [number, number];

export const KIND_WORDS: Record<FaceKind, string> = {
  failing: "failing",
  conflicts: "conflicts",
  running: "running",
  passed: "passed",
  ready: "ready",
  behind: "behind",
  noChecks: "no checks",
  drafts: "drafts",
  open: "open",
};

export const SUMMARY_MIN_TEXT = 18;
export const BAND_HEIGHT = 25;
const KEY_WIDTH = 144;
const MIN_RUNNING_SHARE = 0.15;
const STRIPE_OPACITY = 0.22;
const MAX_STRIPE_STEP = 28;
const MIN_STRIPE_STEP = 12;
const STRIPE_STEP_PER_HEIGHT = 0.64;
const STRIPE_SHIFT_PER_FRAME = 0.3125;
const SCRIM_OPACITY = 0.28;
const CHIP_SCRIM_OPACITY = 0.4;
const CHIP_HEIGHT = 26;
const CHIP_RADIUS = 6;
const CHIP_GAP = 5;
const CHIP_LEFT = 9;
const CHIP_RIGHT_LIMIT = 135;
const CHIP_SIZES = [20, 18];
const LOUD_KINDS: FaceKind[] = ["failing", "conflicts"];

export function fitSize(content: string, maxSize: number, maxWidth: number, minSize = SUMMARY_MIN_TEXT): number {
  let size = maxSize;
  while (size > minSize && textWidth(content, size) > maxWidth) size -= 1;
  return size;
}

// Keeps the part of a polygon where valueOf(point) >= 0. Stripes use it in place of a clip path, which Qt lacks.
function clipPolygon(points: Point[], valueOf: (point: Point) => number): Point[] {
  const kept: Point[] = [];
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    const valueA = valueOf(a);
    const valueB = valueOf(b);
    if (valueA >= 0) kept.push(a);
    if (valueA >= 0 !== valueB >= 0) {
      const share = valueA / (valueA - valueB);
      kept.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]);
    }
  });
  return kept;
}

export function stripes(x: number, y: number, width: number, height: number, frame: number): string {
  if (width <= 0) return "";
  const step = Math.min(MAX_STRIPE_STEP, Math.max(MIN_STRIPE_STEP, height * STRIPE_STEP_PER_HEIGHT));
  const stripeWidth = step / 2;
  const bottom = y + height;
  const shift = (frame * step * STRIPE_SHIFT_PER_FRAME) % step;
  const corners: Point[] = [[x, y], [x + width, y], [x + width, bottom], [x, bottom]];
  const along = (point: Point) => point[0] - (bottom - point[1]);
  let out = "";
  for (let start = x - height - step + shift; start < x + width; start += step) {
    const piece = clipPolygon(clipPolygon(corners, (point) => along(point) - start), (point) => start + stripeWidth - along(point));
    if (piece.length >= 3) {
      const d = "M" + piece.map(([px, py]) => `${round1(px)} ${round1(py)}`).join(" L") + " Z";
      out += path(d, { fill: WHITE, fillOpacity: STRIPE_OPACITY });
    }
  }
  return out;
}

export function runningArea(
  x: number,
  y: number,
  width: number,
  height: number,
  frame: number,
  { share = 1, radius = 0 }: { share?: number; radius?: number } = {},
): string {
  const end = width * Math.min(1, Math.max(MIN_RUNNING_SHARE, share));
  return (
    rect(x, y, width, height, RUNNING_TRACK, { radius }) +
    rect(x, y, end, height, RUNNING, { radius }) +
    stripes(x + radius * 0.5, y, end - radius, height, frame)
  );
}

const AREA_COLORS: Partial<Record<FaceKind, string>> = {
  failing: FAILED,
  conflicts: CONFLICTS,
  running: RUNNING,
  passed: PASSED,
  ready: PASSED,
  behind: BEHIND_AREA,
  drafts: DRAFT_BAND,
};

export function kindAreaColor(kind: FaceKind): string {
  return AREA_COLORS[kind] ?? NO_CHECKS;
}

const TEXT_COLORS: Partial<Record<FaceKind, string>> = {
  failing: FAILING_TEXT,
  conflicts: CONFLICTS_TEXT,
  running: RUNNING_TEXT,
  passed: PASSED_TEXT,
  ready: PASSED_TEXT,
  behind: LAVENDER,
  drafts: DRAFT_TEXT,
};

function kindTextColor(kind: FaceKind): string {
  return TEXT_COLORS[kind] ?? NO_CHECKS_TEXT;
}

export function kindArea(
  kind: FaceKind,
  x: number,
  y: number,
  width: number,
  height: number,
  frame: number,
  { radius = 0, share = 1 }: { radius?: number; share?: number } = {},
): string {
  if (kind === "running") return runningArea(x, y, width, height, frame, { share, radius });
  if (kind === "failing") return rect(x, y, width, height, frame % 2 ? FAILED_DIM : FAILED, { radius });
  return rect(x, y, width, height, kindAreaColor(kind), { radius });
}

function stroke(d: string, color: string, width: number): string {
  return path(d, { stroke: color, strokeWidth: width, isRound: true });
}

function crossIcon(cx: number, cy: number, r: number, color: string): string {
  const s = r * 0.78;
  const d = `M${round1(cx - s)} ${round1(cy - s)} L${round1(cx + s)} ${round1(cy + s)} M${round1(cx + s)} ${round1(cy - s)} L${round1(cx - s)} ${round1(cy + s)}`;
  return stroke(d, color, r * 0.48);
}

function tickIcon(cx: number, cy: number, r: number, color: string): string {
  const d = `M${round1(cx - r * 0.85)} ${round1(cy + r * 0.05)} L${round1(cx - r * 0.25)} ${round1(cy + r * 0.62)} L${round1(cx + r * 0.9)} ${round1(cy - r * 0.6)}`;
  return stroke(d, color, r * 0.48);
}

function dashIcon(cx: number, cy: number, r: number, color: string): string {
  return stroke(`M${round1(cx - r * 0.75)} ${round1(cy)} H${round1(cx + r * 0.75)}`, color, r * 0.48);
}

function arrowDownIcon(cx: number, cy: number, r: number, color: string): string {
  const d = `M${round1(cx)} ${round1(cy - r * 0.9)} V${round1(cy + r * 0.8)} M${round1(cx - r * 0.7)} ${round1(cy + r * 0.1)} L${round1(cx)} ${round1(cy + r * 0.8)} L${round1(cx + r * 0.7)} ${round1(cy + r * 0.1)}`;
  return stroke(d, color, r * 0.42);
}

function spinnerIcon(cx: number, cy: number, r: number, color: string): string {
  const start = -Math.PI / 2;
  const end = start + (270 * Math.PI) / 180;
  const point = (angle: number) => `${round1(cx + r * Math.cos(angle))} ${round1(cy + r * Math.sin(angle))}`;
  const width = r * 0.4;
  return (
    circle(cx, cy, r, "none", { stroke: color, strokeOpacity: 0.35, strokeWidth: width }) +
    stroke(`M${point(start)} A${round1(r)} ${round1(r)} 0 1 1 ${point(end)}`, color, width)
  );
}

function warningIcon(cx: number, cy: number, r: number, color: string, ink: string): string {
  const top = cy - r * 0.95;
  const base = cy + r * 0.8;
  const d = `M${round1(cx)} ${round1(top)} L${round1(cx + r)} ${round1(base)} L${round1(cx - r)} ${round1(base)} Z`;
  return (
    path(d, { fill: color, stroke: color, strokeWidth: r * 0.3, isRound: true }) +
    rect(cx - r * 0.11, cy - r * 0.42, r * 0.22, r * 0.68, ink, { radius: r * 0.1 }) +
    circle(cx, cy + r * 0.52, r * 0.14, ink)
  );
}

function pullRequestIcon(cx: number, cy: number, r: number, color: string): string {
  const width = r * 0.22;
  const dot = r * 0.28;
  const left = cx - r * 0.55;
  const right = cx + r * 0.55;
  const top = cy - r * 0.68;
  const bottom = cy + r * 0.68;
  const ring = (x: number, y: number) => circle(x, y, dot, "none", { stroke: color, strokeWidth: width });
  const arrow =
    `M${round1(right)} ${round1(bottom - dot)} V${round1(cy - r * 0.15)} Q${round1(right)} ${round1(top)} ${round1(cx)} ${round1(top)} ` +
    `M${round1(cx + r * 0.24)} ${round1(top - r * 0.26)} L${round1(cx)} ${round1(top)} L${round1(cx + r * 0.24)} ${round1(top + r * 0.26)}`;
  return (
    ring(left, top) +
    ring(left, bottom) +
    ring(right, bottom) +
    stroke(`M${round1(left)} ${round1(top + dot)} V${round1(bottom - dot)}`, color, width) +
    stroke(arrow, color, width)
  );
}

export function kindIcon(kind: FaceKind, cx: number, cy: number, r: number, color: string, ink = NEUTRAL): string {
  switch (kind) {
    case "failing":
      return crossIcon(cx, cy, r, color);
    case "conflicts":
      return warningIcon(cx, cy, r, color, ink);
    case "running":
      return spinnerIcon(cx, cy, r, color);
    case "passed":
    case "ready":
      return tickIcon(cx, cy, r, color);
    case "behind":
      return arrowDownIcon(cx, cy, r, color);
    case "drafts":
    case "open":
      return pullRequestIcon(cx, cy, r, color);
    case "noChecks":
      return dashIcon(cx, cy, r, color);
  }
}

const BAND_NAME_X = 10;
const BAND_COUNT_RIGHT = 111;
const BAND_BASELINE = 19;
const BAND_TEXT_SIZE = 18;
const CAP_LEFT = 116;
const CAP_WIDTH = 28;
const CAP_MARK_X = 130;
const CAP_MARK_SIZE = 16;

export function bandLabels(name: string, count: string | null): string {
  return (
    text(name, BAND_NAME_X, BAND_BASELINE, BAND_TEXT_SIZE, WHITE) +
    (count ? text(count, BAND_COUNT_RIGHT, BAND_BASELINE, BAND_TEXT_SIZE, WHITE, "end") : "") +
    rect(CAP_LEFT, 0, CAP_WIDTH, BAND_HEIGHT, BLACK, { fillOpacity: SCRIM_OPACITY }) +
    githubMark(CAP_MARK_X, BAND_HEIGHT / 2, CAP_MARK_SIZE, WHITE)
  );
}

export function headerBand(
  name: string,
  pipeline: SummaryPipeline | "neutral",
  share: number,
  frame: number,
  count: string | null = null,
): string {
  let fill: string;
  switch (pipeline) {
    case "failing":
    case "running":
      fill = kindArea(pipeline, 0, 0, KEY_WIDTH, BAND_HEIGHT, frame, { share });
      break;
    case "passed":
      fill = rect(0, 0, KEY_WIDTH, BAND_HEIGHT, PASSED);
      break;
    case "drafts":
      fill = rect(0, 0, KEY_WIDTH, BAND_HEIGHT, DRAFT_BAND);
      break;
    case "neutral":
      fill = rect(0, 0, KEY_WIDTH, BAND_HEIGHT, NEUTRAL_BAND);
      break;
    case "noChecks":
    case "none":
      fill = rect(0, 0, KEY_WIDTH, BAND_HEIGHT, NO_CHECKS);
      break;
  }
  return fill + bandLabels(name, count);
}

type Chip = { kind: FaceKind; content: string; isLoud: boolean; hasIcon: boolean };

export function countChip([kind, count]: [CountKind, number]): Chip {
  return { kind, content: String(count), isLoud: LOUD_KINDS.includes(kind), hasIcon: true };
}

const CHIP_ICON_WIDTH = 21;
const CHIP_ICON_CENTER_X = 11;
const CHIP_PLAIN_LEFT = 7;
const CHIP_PADDING_RIGHT = 7;
const CHIP_ICON_RADIUS = 6;
const CHIP_BASELINE = 19.5;

function drawChip(chip: Chip, x: number, y: number, frame: number, size: number): { width: number; markup: string } {
  const textLeft = chip.hasIcon ? CHIP_ICON_WIDTH : CHIP_PLAIN_LEFT;
  const width = textLeft + textWidth(chip.content, size) + CHIP_PADDING_RIGHT;
  const base = chip.isLoud
    ? kindArea(chip.kind, x, y, width, CHIP_HEIGHT, frame, { radius: CHIP_RADIUS })
    : rect(x, y, width, CHIP_HEIGHT, BLACK, { radius: CHIP_RADIUS, fillOpacity: CHIP_SCRIM_OPACITY });
  const ink = chip.isLoud ? WHITE : kindTextColor(chip.kind);
  const iconInk = chip.isLoud ? kindAreaColor(chip.kind) : NEUTRAL;
  const icon = chip.hasIcon ? kindIcon(chip.kind, x + CHIP_ICON_CENTER_X, y + CHIP_HEIGHT / 2, CHIP_ICON_RADIUS, ink, iconInk) : "";
  return { width, markup: base + icon + text(chip.content, x + textLeft, y + CHIP_BASELINE, size, ink) };
}

// Chips from the left at 20 px, or at 18 px when the row does not fit. At 18 px a chip that still does not fit is left out.
export function chipRow(chips: Chip[], frame: number, top: number): string {
  for (const size of CHIP_SIZES) {
    const isLastSize = size === SUMMARY_MIN_TEXT;
    const drawn = [];
    let x = CHIP_LEFT;
    for (const chip of chips) {
      const made = drawChip(chip, x, top, frame, size);
      if (isLastSize && x + made.width > CHIP_RIGHT_LIMIT) break;
      drawn.push(made.markup);
      x += made.width + CHIP_GAP;
    }
    if (x - CHIP_GAP <= CHIP_RIGHT_LIMIT || isLastSize) return drawn.join("");
  }
  return "";
}
