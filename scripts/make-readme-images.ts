import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  renderBack,
  renderEmptySlot,
  type JiraWindowKind,
  renderJiraWindow,
  renderNoData,
  renderNothingApproved,
  renderOverflow,
  renderTokenFace,
} from "../src/face/other-faces";
import { type PrKeyView, renderPrKey } from "../src/face/pr-face";
import { DEFAULT_SUMMARY_STYLES, renderSummary, type SummaryData, type SummaryStyle } from "../src/face/summary/index";
import { KEY_SIZE } from "../src/face/svg";
import { FRAME_MS } from "../src/frame-timer";
import type { PullRequest } from "../src/github/types";
import { deployList } from "../src/prs/deploy";
import { finishedShareOf, leadOf, type Pipeline, pipelineOf, problemOf, type Review, reviewOf } from "../src/prs/derive";
import { type SlotContent, slotContents } from "../src/prs/slots";
import { summarizeDeploy, summarizeMine } from "../src/prs/summary";

const OUTPUT_DIRECTORY = fileURLToPath(new URL("../docs/images/", import.meta.url));
const FRAME = 0;
const FONT = "Segoe UI, Helvetica, Arial, sans-serif";
const DECK_COLOR = "#0c0c0d";
const CAPTION_COLOR = "#c4c4ca";
const HEADING_COLOR = "#f2f2f4";
const LINE_COLOR = "#ffb020";
const QUIET_COLOR = "#74747e";
const KEY_CLIP = "key-clip";
const KEY_RADIUS = 10;
const DOCUMENT_RADIUS = 18;

// Image pixels. The images draw a 144 px key face at KEY_PIXELS.
const KEY_PIXELS = 96;
const DECK_GAP = 12;
const DECK_MARGIN = 24;
const HEADING_BASELINE = 14;
// From the middle of a 14 or 15 px label to its baseline.
const MIDDLE_TO_BASELINE = 5;
const CAPTION_LINE_HEIGHT = 15;

const SHEET_MARGIN = 28;
const SHEET_PITCH = 136;
const SHEET_ROW_HEIGHT = 190;
const SHEET_ROW_GAP = 40;
const HEADING_TO_KEYS = 28;
const KEYS_TO_CAPTION = 20;

const FRAMES_PER_SECOND = 1000 / FRAME_MS;
const STATE_CHECKS = 10;
// The running key of the faces sheet finishes its checks in these steps. The stripes repeat every 16 frames,
// so the steps must take 16 frames together. With another length the stripes jump when the loop starts again.
// The first step has a band with stripes, because a viewer that does not animate shows the first frame only.
const FINISHED_CHECKS_STEPS = [6, 9, 2, 4];
const CHECKS_STEP_FRAMES = 4;
// A pulse, a flash and the dot of a draft take two frames.
const BLINK_FRAMES = 2;
const JIRA_WINDOW_SECONDS = [3, 2, 1];

const ANATOMY_KEY_PIXELS = 288;
const ANATOMY_KEY_LEFT = 300;
const ANATOMY_KEY_TOP = 36;
const ANATOMY_WIDTH = 920;
const ANATOMY_CHECKS = 10;
const STEP_NAME_WIDTH = 104;
// From the bottom of the key to the baseline of the step names, and the room that the names take.
const KEY_TO_STEP_NAMES = 34;
const STEP_NAMES_ROOM = 48;
const CALLOUT_REACH = 40;
const CALLOUT_TEXT_GAP = 10;
const CALLOUT_DOT_RADIUS = 4;
const CALLOUT_LINE_WIDTH = 2;

const OVERVIEW_KEY_PIXELS = 80;
const OVERVIEW_KEY_GAP = 10;
const OVERVIEW_DECK_SPACE = 40;
// From the bottom of the summary keys to the baseline of the deck headings.
const SUMMARY_TO_DECK_HEADING = 56;
const DECK_HEADING_TO_KEYS = 14;
const ARROW_LINE_WIDTH = 3;
const ARROW_HEAD = 14;
const ARROW_START_GAP = 8;
const ARROW_TO_DECK_HEADING = 20;

const TOUR_KEY_PIXELS = 120;
const TOUR_KEY_GAP = 14;
const BLANK_KEY_COLOR = "#18181b";
// The mark of a finger on a pressed key. The place and the sizes are shares of the key.
const FINGER_COLOR = "#ffffff";
const FINGER_CENTER: Point = [0.6, 0.62];
const FINGER_RADIUS = 0.21;
const FINGER_RING_RADIUS = 0.36;
const FINGER_LINE_WIDTH = 3;
// The browser card of the tour, in image pixels from its top left corner.
const CARD_WIDTH = 336;
const CARD_HEIGHT = 92;
const CARD_INSET = 10;
const CARD_RADIUS = 10;
const CARD_PADDING = 16;
const CARD_SHADOW_SHIFT: Point = [5, 6];
const CARD_DOT_LEFT = 17;
const CARD_DOT_MIDDLE = 17;
const CARD_DOT_PITCH = 12;
const CARD_DOT_RADIUS = 4;
const CARD_BAR_LEFT = 54;
const CARD_BAR_RIGHT = 12;
const CARD_BAR_TOP = 7;
const CARD_BAR_HEIGHT = 20;
const CARD_ADDRESS_BASELINE = 21;
const CARD_TITLE_BASELINE = 53;
const CARD_NOTE_BASELINE = 74;
const CARD_COLOR = "#f4f5f7";
const CARD_BAR_COLOR = "#e2e5ea";
const CARD_DOT_COLOR = "#c5c9d1";
const CARD_SHADOW_COLOR = "#000000";

const SUMMARY_PITCH = 144;
const SUMMARY_ROW_PITCH = 116;
const SUMMARY_KEYS_TOP = 92;
const STYLE_LABEL_WIDTH = 112;
const STYLE_NOTE_GAP = 18;
const STATE_GROUP_GAP = 32;
const STATE_NAME_BASELINE = 42;
const STATE_CAPTION_TOP = 60;

const DECK_PAIR_GAP = 56;

type Point = [number, number];
type Anchor = "start" | "middle" | "end";
type TextStyle = { size: number; fill: string; weight: number };

const HEADING: TextStyle = { size: 15, fill: HEADING_COLOR, weight: 600 };
const CAPTION: TextStyle = { size: 12, fill: CAPTION_COLOR, weight: 400 };
const MARKED_CALLOUT: TextStyle = { ...HEADING, fill: LINE_COLOR };
const STEP_NAME: TextStyle = { size: 14, fill: QUIET_COLOR, weight: 500 };
const CURRENT_STEP_NAME: TextStyle = { size: 14, fill: LINE_COLOR, weight: 700 };
const STEP_ARROW: TextStyle = { size: 16, fill: QUIET_COLOR, weight: 400 };
const CARD_ADDRESS: TextStyle = { size: 11.5, fill: "#454b55", weight: 400 };
const CARD_TITLE: TextStyle = { size: 14, fill: "#16191d", weight: 600 };
const CARD_NOTE: TextStyle = { size: 12.5, fill: "#5b6470", weight: 400 };

type Deck = { columns: number; rows: number };

const MK2: Deck = { columns: 5, rows: 3 };
const NEO: Deck = { columns: 4, rows: 2 };
// The labels of the Back key in the PR Vitals and PR Deploy profiles.
const MY_PRS_BACK = "my PRs";
const DEPLOY_BACK = "deploy";

const REPO_COLORS: Record<string, string> = {
  "web-shop": "#4cc9f0",
  "billing-api": "#f4a261",
  "mobile-app": "#80ed99",
  "docs-site": "#d6a4ff",
};
const PROBLEMS: Partial<Record<Review, string>> = { behind: "behind main", conflicts: "conflicts", changes: "changes asked" };

// A notice replaces the review problem.
type Sample = {
  ticket?: string;
  number?: number;
  title: string;
  repo: string;
  pipeline: Pipeline;
  review: Review;
  share?: number;
  isTicketResolved?: boolean;
  isPulsing?: boolean;
  notice?: string;
};

function prKeyAt(sample: Sample, frame: number): string {
  const { ticket, number, title, repo, pipeline, review, share = 0.5, isTicketResolved = false, isPulsing = false, notice } = sample;
  const view: PrKeyView = {
    label: ticket ?? `#${number}`,
    isTicketResolved,
    pipeline,
    finishedShare: share,
    isPulsing,
    review,
    title,
    repo,
    repoColor: REPO_COLORS[repo],
    problem: notice ?? PROBLEMS[review] ?? null,
  };
  return renderPrKey(view, frame);
}

function prKey(sample: Sample): string {
  return prKeyAt(sample, FRAME);
}

// A pull request of the sample board. Its title starts with the ticket, as on GitHub.
type BoardPr = { title: string; repo: string; number: number; pipeline: Pipeline; review: Review; finishedChecks?: number };

const JIRA_PROJECTS = ["SHOP", "BILL", "APP"];
const RESOLVED_TICKETS = ["BILL-377", "APP-199"];
const JIRA_SITE = "example.atlassian.net";
// The newest pull request is first.
const BOARD: BoardPr[] = [
  { title: "SHOP-1482 Add gift card balance check", repo: "web-shop", number: 1904, pipeline: "running", review: "review", finishedChecks: 5 },
  { title: "BILL-377 Fix rounding on refund totals", repo: "billing-api", number: 642, pipeline: "passed", review: "approved" },
  { title: "Dark mode for the settings screen", repo: "mobile-app", number: 912, pipeline: "failed", review: "review" },
  { title: "SHOP-1479 Cache product search results", repo: "web-shop", number: 1899, pipeline: "passed", review: "changes" },
  { title: "BILL-374 Invoice PDF export", repo: "billing-api", number: 638, pipeline: "running", review: "draft", finishedChecks: 5 },
  { title: "APP-208 Upgrade the push library", repo: "mobile-app", number: 909, pipeline: "passed", review: "behind" },
  { title: "Describe the release process", repo: "docs-site", number: 88, pipeline: "none", review: "review" },
  { title: "SHOP-1471 Remove the old checkout flow", repo: "web-shop", number: 1885, pipeline: "failed", review: "conflicts" },
  { title: "BILL-370 Retry failed webhook calls", repo: "billing-api", number: 631, pipeline: "passed", review: "approved" },
  { title: "APP-205 Fix crash on empty cart", repo: "mobile-app", number: 907, pipeline: "running", review: "review", finishedChecks: 8 },
  { title: "SHOP-1466 Show delivery date on the cart", repo: "web-shop", number: 1878, pipeline: "passed", review: "review" },
  { title: "Offline mode for order history", repo: "mobile-app", number: 905, pipeline: "failed", review: "draft" },
  { title: "BILL-366 Add tax rate for Norway", repo: "billing-api", number: 625, pipeline: "running", review: "approved", finishedChecks: 7 },
  { title: "Fix broken links in the guide", repo: "docs-site", number: 85, pipeline: "passed", review: "review" },
  { title: "SHOP-1459 Speed up image loading", repo: "web-shop", number: 1866, pipeline: "running", review: "changes", finishedChecks: 3 },
  { title: "APP-199 Translate onboarding to German", repo: "mobile-app", number: 898, pipeline: "passed", review: "approved" },
];

function escapeXml(content: string): string {
  return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function label(content: string, [x, y]: Point, { size, fill, weight }: TextStyle, anchor: Anchor = "start"): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(content)}</text>`;
}

// A "|" in the content starts a new line.
function caption(content: string, [x, top]: Point, anchor: Anchor = "middle"): string {
  return content
    .split("|")
    .map((line, index) => label(line, [x, top + index * CAPTION_LINE_HEIGHT], CAPTION, anchor))
    .join("");
}

function placeKey(keyMarkup: string, [x, y]: Point, size = KEY_PIXELS): string {
  const inner = keyMarkup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}"><g clip-path="url(#${KEY_CLIP})">${inner}</g></svg>`;
}

function document(width: number, height: number, content: string): string {
  const radius = (KEY_RADIUS * KEY_SIZE) / KEY_PIXELS;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><clipPath id="${KEY_CLIP}"><rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="${radius}"/></clipPath></defs>` +
    `<rect width="${width}" height="${height}" rx="${DOCUMENT_RADIUS}" fill="${DECK_COLOR}"/>${content}</svg>\n`
  );
}

function write(name: string, content: string): void {
  writeFileSync(`${OUTPUT_DIRECTORY}${name}`, content);
}

// The width or height of a run of keys with gaps between them.
function spanOf(count: number, size = KEY_PIXELS, gap = DECK_GAP): number {
  return count * size + (count - 1) * gap;
}

// Places the keys row by row, as a deck does.
function deckKeys(keys: string[], columns: number, [left, top]: Point, size = KEY_PIXELS, gap = DECK_GAP): string {
  const pitch = size + gap;
  return keys
    .map((key, index) => placeKey(key, [left + (index % columns) * pitch, top + Math.floor(index / columns) * pitch], size))
    .join("");
}

type AnatomyPart = "ticket" | "title" | "repo" | "tick" | "band" | "background";
// Target is a point on the key face, in key pixels.
type Callout = { side: "left" | "right"; labelY: number; target: Point };
// One state of the anatomy key. changed: the part that differs from the step before.
type AnatomyStep = {
  name: string;
  frames: number;
  changed: AnatomyPart;
  pipeline: Pipeline;
  finishedChecks?: number;
  review: Review;
  isTicketResolved?: boolean;
};

const ANATOMY_CALLOUTS: Record<AnatomyPart, Callout> = {
  ticket: { side: "left", labelY: 60, target: [4, 12] },
  title: { side: "left", labelY: 180, target: [4, 72] },
  repo: { side: "left", labelY: 300, target: [6, 130] },
  tick: { side: "right", labelY: 40, target: [130, 12] },
  band: { side: "right", labelY: 110, target: [100, 20] },
  background: { side: "right", labelY: 250, target: [136, 60] },
};
const ANATOMY_SAMPLE = { ticket: "BILL-377", title: "Fix rounding on refund totals", repo: "billing-api" };
// The loop starts with the complete key, so a viewer that does not animate shows every part.
const ANATOMY_STEPS: AnatomyStep[] = [
  { name: "Resolved", frames: 5, changed: "tick", pipeline: "passed", review: "approved", isTicketResolved: true },
  { name: "Running", frames: 2, changed: "band", pipeline: "running", finishedChecks: 2, review: "review" },
  { name: "Running", frames: 2, changed: "band", pipeline: "running", finishedChecks: 6, review: "review" },
  { name: "Running", frames: 2, changed: "band", pipeline: "running", finishedChecks: 9, review: "review" },
  { name: "Passed", frames: 3, changed: "band", pipeline: "passed", review: "review" },
  { name: "Approved", frames: 4, changed: "background", pipeline: "passed", review: "approved" },
];
// The step names under the key, in the order of the life of a pull request.
const ANATOMY_STEP_NAMES = ["Running", "Passed", "Approved", "Resolved"];

// A null part has no callout in this step.
function calloutTexts({ pipeline, finishedChecks, review, isTicketResolved }: AnatomyStep): Record<AnatomyPart, string | null> {
  return {
    ticket: "Ticket from the title or branch",
    title: "Title",
    repo: "Repo chip, in the repo colour",
    tick: isTicketResolved ? "Tick: the Jira ticket is resolved" : null,
    band: pipeline === "running" ? `Pipeline band: ${finishedChecks} of ${ANATOMY_CHECKS} checks done` : "Pipeline band: all checks passed",
    background: review === "approved" ? "Green background: ready to deploy" : "Dark background: in review",
  };
}

function callout({ side, labelY, target }: Callout, content: string, style: TextStyle): string {
  const scale = ANATOMY_KEY_PIXELS / KEY_SIZE;
  const targetX = ANATOMY_KEY_LEFT + target[0] * scale;
  const targetY = ANATOMY_KEY_TOP + target[1] * scale;
  const isLeft = side === "left";
  const lineEnd = isLeft ? ANATOMY_KEY_LEFT - CALLOUT_REACH : ANATOMY_KEY_LEFT + ANATOMY_KEY_PIXELS + CALLOUT_REACH;
  const textX = isLeft ? lineEnd - CALLOUT_TEXT_GAP : lineEnd + CALLOUT_TEXT_GAP;
  return (
    `<polyline points="${lineEnd},${labelY} ${targetX},${targetY}" fill="none" stroke="${LINE_COLOR}" stroke-width="${CALLOUT_LINE_WIDTH}"/>` +
    `<circle cx="${targetX}" cy="${targetY}" r="${CALLOUT_DOT_RADIUS}" fill="${LINE_COLOR}"/>` +
    label(content, [textX, labelY + MIDDLE_TO_BASELINE], style, isLeft ? "end" : "start")
  );
}

function stepNames(currentName: string): string {
  const left = ANATOMY_KEY_LEFT + ANATOMY_KEY_PIXELS / 2 - (ANATOMY_STEP_NAMES.length * STEP_NAME_WIDTH) / 2;
  const baseline = ANATOMY_KEY_TOP + ANATOMY_KEY_PIXELS + KEY_TO_STEP_NAMES;
  return ANATOMY_STEP_NAMES.map((name, index) => {
    const x = left + index * STEP_NAME_WIDTH;
    const arrow = index === 0 ? "" : label("›", [x, baseline], STEP_ARROW, "middle");
    return arrow + label(name, [x + STEP_NAME_WIDTH / 2, baseline], name === currentName ? CURRENT_STEP_NAME : STEP_NAME, "middle");
  }).join("");
}

// One key through its life. In each step one part changes, and the callout of that part is marked.
function anatomyImage(): string {
  const frames: AnimationFrame[] = [];
  for (const step of ANATOMY_STEPS) {
    const texts = calloutTexts(step);
    const share = (step.finishedChecks ?? ANATOMY_CHECKS) / ANATOMY_CHECKS;
    const sample: Sample = { ...ANATOMY_SAMPLE, pipeline: step.pipeline, review: step.review, share, isTicketResolved: step.isTicketResolved };
    for (let count = 0; count < step.frames; count++) {
      const frame: AnimationFrame = new Map();
      frame.set("key", placeKey(prKeyAt(sample, frames.length), [ANATOMY_KEY_LEFT, ANATOMY_KEY_TOP], ANATOMY_KEY_PIXELS));
      for (const part of Object.keys(ANATOMY_CALLOUTS) as AnatomyPart[]) {
        const content = texts[part];
        const style = part === step.changed ? MARKED_CALLOUT : HEADING;
        frame.set(`callout-${part}`, content === null ? "" : callout(ANATOMY_CALLOUTS[part], content, style));
      }
      frame.set("step-names", stepNames(step.name));
      frames.push(frame);
    }
  }
  return flipbook(ANATOMY_WIDTH, ANATOMY_KEY_TOP * 2 + ANATOMY_KEY_PIXELS + STEP_NAMES_ROOM, frames);
}

// faces: one face, or the faces of a key that moves, one for each frame of its loop.
type CaptionedKey = [faces: string | string[], caption: string];
type SheetRow = { heading: string; keys: CaptionedKey[] };

// Rows of keys, each row with a heading and each key with a caption. Each key that moves has its own loop.
function sheet(rows: SheetRow[]): string {
  const columns = Math.max(...rows.map((row) => row.keys.length));
  const width = SHEET_MARGIN * 2 + (columns - 1) * SHEET_PITCH + KEY_PIXELS;
  const rules: AnimationRules = new Map();
  const content = rows
    .map((row, rowIndex) => {
      const top = SHEET_MARGIN + rowIndex * SHEET_ROW_HEIGHT;
      const keysTop = top + HEADING_TO_KEYS;
      const keys = row.keys
        .map(([faces, text], index) => {
          const x = SHEET_MARGIN + index * SHEET_PITCH;
          const frames = [faces].flat().map((face) => placeKey(face, [x, keysTop]));
          return loopMarkup(frames, rules) + caption(text, [x + KEY_PIXELS / 2, keysTop + KEY_PIXELS + KEYS_TO_CAPTION]);
        })
        .join("");
      return label(row.heading, [SHEET_MARGIN, top + HEADING_BASELINE], HEADING) + keys;
    })
    .join("");
  return document(width, SHEET_MARGIN * 2 + rows.length * SHEET_ROW_HEIGHT - SHEET_ROW_GAP, animationStyle(rules) + content);
}

const STATE_SAMPLE = { repo: "web-shop", title: "Add gift card balance check", ticket: "SHOP-1482" };

function facesOf(frameCount: number, faceAt: (frame: number) => string): string[] {
  return Array.from({ length: frameCount }, (_, frame) => faceAt(frame));
}

function blinkingKey(sample: Sample): string[] {
  return facesOf(BLINK_FRAMES, (frame) => prKeyAt(sample, frame));
}

// The stripes run, and the band grows as the checks finish.
function runningKey(sample: Sample): string[] {
  return facesOf(FINISHED_CHECKS_STEPS.length * CHECKS_STEP_FRAMES, (frame) => {
    const finishedChecks = FINISHED_CHECKS_STEPS[Math.floor(frame / CHECKS_STEP_FRAMES)];
    return prKeyAt({ ...sample, share: finishedChecks / STATE_CHECKS }, frame);
  });
}

function jiraCountdown(kind: JiraWindowKind): string[] {
  return facesOf(JIRA_WINDOW_SECONDS.length * FRAMES_PER_SECOND, (frame) =>
    renderJiraWindow(kind, JIRA_WINDOW_SECONDS[Math.floor(frame / FRAMES_PER_SECOND)]),
  );
}

// Every face of a pull request key. A face that moves on a deck moves here too.
function statesImage(): string {
  const withoutTicket = { ...STATE_SAMPLE, ticket: undefined, number: 4521 };
  const pipeline = (state: Pipeline): Sample => ({ ...STATE_SAMPLE, pipeline: state, review: "review" });
  const review = (state: Review): Sample => ({ ...STATE_SAMPLE, pipeline: "passed", review: state });
  return sheet([
    {
      heading: "Pipeline (the band at the top)",
      keys: [
        [prKey(pipeline("passed")), "Passed"],
        [runningKey(pipeline("running")), "Running|fills as checks finish"],
        [blinkingKey({ ...pipeline("failed"), isPulsing: true }), "Failed|pulses for 5 minutes"],
        [prKey({ ...withoutTicket, pipeline: "none", review: "review" }), "No checks"],
      ],
    },
    {
      heading: "Review (the background)",
      keys: [
        [prKey(review("approved")), "Ready|to deploy"],
        [blinkingKey(review("behind")), "Approved|but behind main"],
        [blinkingKey(review("conflicts")), "Approved|with conflicts"],
        [prKey(review("changes")), "Changes asked"],
        [prKey(review("review")), "In review"],
        [blinkingKey({ ...STATE_SAMPLE, pipeline: "running", review: "draft" }), "Draft|no band, dot = pipeline"],
      ],
    },
    {
      heading: "Jira (the tick and the second press)",
      keys: [
        [prKey(review("review")), "Ticket open|no tick"],
        [prKey({ ...review("approved"), isTicketResolved: true }), "Ticket resolved|white tick"],
        [prKey({ ...withoutTicket, pipeline: "passed", review: "review" }), "No ticket|shows the PR number"],
        [jiraCountdown("ticket"), "Press again|for JIRA"],
        [jiraCountdown("noTicket"), "No ticket"],
        [jiraCountdown("noSite"), "No Jira site"],
      ],
    },
  ]);
}

function problemsImage(): string {
  const withNotice = (notice: string): string => prKey({ ...STATE_SAMPLE, pipeline: "passed", review: "review", notice });
  return sheet([
    {
      heading: "Connection problems",
      keys: [
        [withNotice("offline 4m"), "Offline|data is 4 minutes old"],
        [withNotice("paused to 14:05"), "Rate limited|paused until 14:05"],
        [renderNoData("offline"), "No data yet|first key, offline"],
      ],
    },
    {
      heading: "Token problems (the first key)",
      keys: [
        [renderTokenFace("missing"), "No token|press to make one"],
        [renderTokenFace("expired"), "Token expired|press to make a new one"],
        [renderTokenFace("sso"), "Token needs SSO|press to authorise it"],
        [renderTokenFace("noAccess"), "Token has no access|press to make a new one"],
      ],
    },
  ]);
}

const SAMPLE_PR: PullRequest = {
  number: 1,
  title: "Sample pull request",
  url: "https://github.com/example/web-shop/pull/1",
  createdAt: "2026-11-24T10:00:00Z",
  isDraft: false,
  headRefName: "sample",
  baseRefName: "main",
  reviewDecision: "REVIEW_REQUIRED",
  mergeStateStatus: "CLEAN",
  repository: "web-shop",
  owner: "example",
  rollupState: "SUCCESS",
  finishedChecks: 10,
  totalChecks: 10,
};
const PASSED_CHECKS: Partial<PullRequest> = { rollupState: "SUCCESS", finishedChecks: 10, totalChecks: 10 };
const FAILED_CHECKS: Partial<PullRequest> = { rollupState: "FAILURE", finishedChecks: 8, totalChecks: 10 };
const RUNNING_CHECKS: Partial<PullRequest> = { rollupState: "PENDING", finishedChecks: 6, totalChecks: 10 };
const NO_CHECKS: Partial<PullRequest> = { rollupState: null, finishedChecks: 0, totalChecks: 0 };
const WITH_CONFLICTS: Partial<PullRequest> = { mergeStateStatus: "DIRTY" };
const BEHIND_BASE: Partial<PullRequest> = { mergeStateStatus: "BEHIND" };
const APPROVED: Partial<PullRequest> = { reviewDecision: "APPROVED" };
const DRAFT: Partial<PullRequest> = { isDraft: true };

function samplePrs(count: number, facts: Partial<PullRequest>): PullRequest[] {
  return Array.from({ length: count }, (_, index) => ({ ...SAMPLE_PR, number: index + 1, ...facts }));
}

const DRAFTS = [...samplePrs(14, { ...PASSED_CHECKS, ...DRAFT }), ...samplePrs(4, { ...PASSED_CHECKS, ...DRAFT, ...WITH_CONFLICTS })];

function mine(prs: PullRequest[]): SummaryData {
  return { kind: "mine", summary: summarizeMine(prs) };
}

function deploy(approved: PullRequest[]): SummaryData {
  return { kind: "deploy", summary: summarizeDeploy(approved) };
}

type SummaryState = { name: string; caption: string; data: SummaryData; isInReadme?: boolean };
type SummaryGroup = { name: string; states: SummaryState[] };

const SUMMARY_STYLE_ROWS: { style: SummaryStyle; name: string; note?: string }[] = [
  { style: "scoreboard", name: "Scoreboard", note: "default for My PRs" },
  { style: "signal", name: "Signal", note: "default for Deploy" },
  { style: "ledger", name: "Ledger" },
];

const SUMMARY_GROUPS: SummaryGroup[] = [
  {
    name: "My PRs",
    states: [
      {
        name: "Busy",
        isInReadme: true,
        caption: "1 failing, 3 conflicts,|4 running, 18 drafts",
        data: mine([
          ...samplePrs(1, FAILED_CHECKS),
          ...samplePrs(4, RUNNING_CHECKS),
          ...samplePrs(7, PASSED_CHECKS),
          ...samplePrs(3, { ...PASSED_CHECKS, ...WITH_CONFLICTS }),
          ...samplePrs(1, NO_CHECKS),
          ...DRAFTS,
        ]),
      },
      {
        name: "Conflicts only",
        caption: "all passed, but 2|have conflicts",
        data: mine([...samplePrs(13, PASSED_CHECKS), ...samplePrs(2, { ...PASSED_CHECKS, ...WITH_CONFLICTS }), ...samplePrs(1, NO_CHECKS), ...DRAFTS]),
      },
      {
        name: "Running",
        caption: "2 running,|no problems",
        data: mine([...samplePrs(2, RUNNING_CHECKS), ...samplePrs(13, PASSED_CHECKS), ...samplePrs(1, NO_CHECKS), ...DRAFTS]),
      },
      {
        name: "All green",
        isInReadme: true,
        caption: "no problems,|nothing runs",
        data: mine([...samplePrs(15, PASSED_CHECKS), ...samplePrs(1, NO_CHECKS), ...DRAFTS]),
      },
      { name: "Only drafts", caption: "18 drafts,|nothing else", data: mine(DRAFTS) },
    ],
  },
  {
    name: "Deploy",
    states: [
      {
        name: "Ready",
        isInReadme: true,
        caption: "3 ready; 1 failing,|1 behind, 1 running",
        data: deploy([
          ...samplePrs(3, { ...APPROVED, ...PASSED_CHECKS }),
          ...samplePrs(1, { ...APPROVED, ...FAILED_CHECKS }),
          ...samplePrs(1, { ...APPROVED, ...PASSED_CHECKS, ...BEHIND_BASE }),
          ...samplePrs(1, { ...APPROVED, ...RUNNING_CHECKS }),
        ]),
      },
      {
        name: "Approved, blocked",
        caption: "1 behind main,|1 with conflicts",
        data: deploy([
          ...samplePrs(1, { ...APPROVED, ...PASSED_CHECKS, ...BEHIND_BASE }),
          ...samplePrs(1, { ...APPROVED, ...PASSED_CHECKS, ...WITH_CONFLICTS }),
        ]),
      },
      { name: "Nothing approved", isInReadme: true, caption: "0 approved", data: deploy([]) },
    ],
  },
];

const README_SUMMARY_GROUPS: SummaryGroup[] = SUMMARY_GROUPS.map((group) => ({
  ...group,
  states: group.states.filter((state) => state.isInReadme),
}));

// One row per style, one column per state. Each group of states has a heading.
function summaryImage(groups: SummaryGroup[]): string {
  const keysTop = SHEET_MARGIN + SUMMARY_KEYS_TOP;
  const rowTop = (row: number): number => keysTop + row * SUMMARY_ROW_PITCH;
  let content = SUMMARY_STYLE_ROWS.map(({ name, note }, row) => {
    const baseline = rowTop(row) + KEY_PIXELS / 2 + MIDDLE_TO_BASELINE;
    return label(name, [SHEET_MARGIN, baseline], HEADING) + (note ? caption(note, [SHEET_MARGIN, baseline + STYLE_NOTE_GAP], "start") : "");
  }).join("");
  let left = SHEET_MARGIN + STYLE_LABEL_WIDTH;
  for (const group of groups) {
    content += label(group.name, [left, SHEET_MARGIN + HEADING_BASELINE], HEADING);
    group.states.forEach((state, index) => {
      const x = left + index * SUMMARY_PITCH;
      const center = x + KEY_PIXELS / 2;
      content +=
        label(state.name, [center, SHEET_MARGIN + STATE_NAME_BASELINE], HEADING, "middle") +
        caption(state.caption, [center, SHEET_MARGIN + STATE_CAPTION_TOP]) +
        SUMMARY_STYLE_ROWS.map(({ style }, row) => placeKey(renderSummary(state.data, style, FRAME), [x, rowTop(row)])).join("");
    });
    left += group.states.length * SUMMARY_PITCH + STATE_GROUP_GAP;
  }
  const width = left - STATE_GROUP_GAP - (SUMMARY_PITCH - KEY_PIXELS) + SHEET_MARGIN;
  const height = rowTop(SUMMARY_STYLE_ROWS.length - 1) + KEY_PIXELS + SHEET_MARGIN;
  return document(width, height, content);
}

const APPROVED_SAMPLES: Sample[] = [
  { ticket: "BILL-377", title: "Fix rounding on refund totals", repo: "billing-api", pipeline: "passed", review: "approved", isTicketResolved: true },
  { ticket: "SHOP-1447", title: "Fix the wish list counter", repo: "web-shop", pipeline: "passed", review: "approved" },
  { ticket: "APP-208", title: "Upgrade the push library", repo: "mobile-app", pipeline: "passed", review: "behind" },
  { ticket: "SHOP-1471", title: "Remove the old checkout flow", repo: "web-shop", pipeline: "passed", review: "conflicts" },
  { ticket: "BILL-358", title: "Log the payment provider errors", repo: "billing-api", pipeline: "failed", review: "approved" },
  { number: 88, title: "Describe the release process", repo: "docs-site", pipeline: "running", review: "approved", share: 0.6 },
];
const MORE_APPROVED_PRS = 2;

type CaptionedDeck = { heading: string; keys: string[]; caption: string };

// The PR Deploy profile on a Stream Deck Neo: with approved PRs, and with none.
function deployKeysImage(): string {
  const nothingApproved = [renderBack(DEPLOY_BACK), renderNothingApproved()];
  const freeSlots = NEO.columns * NEO.rows - nothingApproved.length;
  const decks: CaptionedDeck[] = [
    {
      heading: "Approved PRs",
      keys: [renderBack(DEPLOY_BACK), ...APPROVED_SAMPLES.map(prKey), renderOverflow(MORE_APPROVED_PRS)],
      caption: "Ready PRs come first.|Then the blocked ones.",
    },
    {
      heading: "Nothing approved",
      keys: [...nothingApproved, ...Array.from({ length: freeSlots }, renderEmptySlot)],
      caption: "The first key opens your approved PRs on GitHub.|The other keys stay free.",
    },
  ];
  const deckWidth = spanOf(NEO.columns);
  const keysTop = SHEET_MARGIN + HEADING_TO_KEYS;
  const captionTop = keysTop + spanOf(NEO.rows) + KEYS_TO_CAPTION;
  const content = decks
    .map(({ heading, keys, caption: text }, index) => {
      const left = SHEET_MARGIN + index * (deckWidth + DECK_PAIR_GAP);
      return (
        label(heading, [left, SHEET_MARGIN + HEADING_BASELINE], HEADING) +
        deckKeys(keys, NEO.columns, [left, keysTop]) +
        caption(text, [left, captionTop], "start")
      );
    })
    .join("");
  const width = SHEET_MARGIN * 2 + spanOf(decks.length, deckWidth, DECK_PAIR_GAP);
  return document(width, captionTop + CAPTION_LINE_HEIGHT + SHEET_MARGIN, content);
}

const PIPELINE_FACTS: Record<Pipeline, Partial<PullRequest>> = {
  passed: PASSED_CHECKS,
  failed: FAILED_CHECKS,
  running: RUNNING_CHECKS,
  none: NO_CHECKS,
};
const REVIEW_FACTS: Record<Review, Partial<PullRequest>> = {
  approved: APPROVED,
  behind: { ...APPROVED, ...BEHIND_BASE },
  conflicts: { ...APPROVED, ...WITH_CONFLICTS },
  changes: { reviewDecision: "CHANGES_REQUESTED" },
  review: {},
  draft: DRAFT,
};

function pullRequestOf({ title, repo, number, pipeline, review, finishedChecks }: BoardPr): PullRequest {
  const pullRequest = { ...SAMPLE_PR, number, title, repository: repo, ...PIPELINE_FACTS[pipeline], ...REVIEW_FACTS[review] };
  return finishedChecks === undefined ? pullRequest : { ...pullRequest, finishedChecks };
}

const BOARD_PRS = BOARD.map(pullRequestOf);
const BOARD_DEPLOY_PRS = deployList(BOARD_PRS, () => SAMPLE_PR.baseRefName);

// The same steps as PrStatus.viewOf. A key and the counts come from the same pull request, so they agree.
function boardKey(pr: PullRequest, frame: number): string {
  const { ticket, title } = leadOf(pr, JIRA_PROJECTS);
  const view: PrKeyView = {
    label: ticket ?? `#${pr.number}`,
    isTicketResolved: ticket !== null && RESOLVED_TICKETS.includes(ticket),
    pipeline: pipelineOf(pr),
    finishedShare: finishedShareOf(pr),
    isPulsing: false,
    review: reviewOf(pr),
    title,
    repo: pr.repository,
    repoColor: REPO_COLORS[pr.repository],
    problem: problemOf(pr),
  };
  return renderPrKey(view, frame);
}

function slotFace(content: SlotContent, frame: number): string {
  if (content.kind === "pr") return boardKey(content.pr, frame);
  if (content.kind === "overflow") return renderOverflow(content.count);
  return renderEmptySlot();
}

// A deck with a bundled profile: Back on the first key, slots on the other keys.
function profileKeys(backLabel: string, prs: PullRequest[], deck: Deck, frame: number): string[] {
  const slots = slotContents(prs, deck.columns * deck.rows - 1, prs.length);
  return [renderBack(backLabel), ...slots.map((slot) => slotFace(slot, frame))];
}

// A line from the start, sideways to the x of the tip, then down. The arrow head is at the tip.
function arrowDown([startX, startY]: Point, [tipX, tipY]: Point): string {
  const headTop = tipY - ARROW_HEAD;
  const halfHead = ARROW_HEAD / 2;
  return (
    `<polyline points="${startX},${startY} ${tipX},${startY} ${tipX},${headTop}" fill="none" stroke="${LINE_COLOR}" stroke-width="${ARROW_LINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<polygon points="${tipX},${tipY} ${tipX - halfHead},${headTop} ${tipX + halfHead},${headTop}" fill="${LINE_COLOR}"/>`
  );
}

// The two summary keys, each with an arrow to the deck that it opens. The board feeds every key.
function overviewImage(): string {
  const deckSpan = (count: number): number => spanOf(count, OVERVIEW_KEY_PIXELS, OVERVIEW_KEY_GAP);
  const deployLeft = DECK_MARGIN;
  const mineLeft = deployLeft + deckSpan(NEO.columns) + OVERVIEW_DECK_SPACE;
  const deployCenter = deployLeft + deckSpan(NEO.columns) / 2;
  const mineCenter = mineLeft + deckSpan(MK2.columns) / 2;
  const summaryKeys = [
    renderSummary(deploy(BOARD_DEPLOY_PRS), DEFAULT_SUMMARY_STYLES.deploy, FRAME),
    renderSummary(mine(BOARD_PRS), DEFAULT_SUMMARY_STYLES.mine, FRAME),
  ];
  const summaryWidth = spanOf(summaryKeys.length);
  const summaryLeft = Math.round((deployCenter + mineCenter - summaryWidth) / 2);
  const summaryTop = DECK_MARGIN + HEADING_TO_KEYS;
  const summaryMiddle = summaryTop + KEY_PIXELS / 2;
  const headingBaseline = summaryTop + KEY_PIXELS + SUMMARY_TO_DECK_HEADING;
  const decksTop = headingBaseline + DECK_HEADING_TO_KEYS;
  const arrowTip = headingBaseline - ARROW_TO_DECK_HEADING;
  const deck = (keys: string[], { columns }: Deck, left: number): string =>
    deckKeys(keys, columns, [left, decksTop], OVERVIEW_KEY_PIXELS, OVERVIEW_KEY_GAP);
  const content =
    label("On your own profile", [summaryLeft + summaryWidth / 2, DECK_MARGIN + HEADING_BASELINE], HEADING, "middle") +
    deckKeys(summaryKeys, summaryKeys.length, [summaryLeft, summaryTop]) +
    arrowDown([summaryLeft - ARROW_START_GAP, summaryMiddle], [deployCenter, arrowTip]) +
    arrowDown([summaryLeft + summaryWidth + ARROW_START_GAP, summaryMiddle], [mineCenter, arrowTip]) +
    label("Deploy: your approved PRs", [deployCenter, headingBaseline], HEADING, "middle") +
    label("My PRs: all your open PRs", [mineCenter, headingBaseline], HEADING, "middle") +
    deck(profileKeys(DEPLOY_BACK, BOARD_DEPLOY_PRS, NEO, FRAME), NEO, deployLeft) +
    deck(profileKeys(MY_PRS_BACK, BOARD_PRS, MK2, FRAME), MK2, mineLeft) +
    caption("Back returns you|to your own profile.", [deployLeft, decksTop + deckSpan(NEO.rows) + KEYS_TO_CAPTION], "start");
  const width = mineLeft + deckSpan(MK2.columns) + DECK_MARGIN;
  return document(width, decksTop + deckSpan(MK2.rows) + DECK_MARGIN, content);
}

type TourView = "profile" | "mine" | "deploy";
type BrowserPage = "github" | "jira";
// frames: how long the step shows. The plugin draws one frame every FRAME_MS.
type TourStep = { view: TourView; frames: number; pressedKey?: number; jiraSeconds?: number; page?: BrowserPage };
type BrowserCard = { address: string; title: string; note: string };
type AnimationFrame = Map<string, string>;

const TOUR_HEADINGS: Record<TourView, string> = {
  profile: "Your own profile",
  mine: "The PR Vitals profile",
  deploy: "The PR Deploy profile",
};
const BACK_KEY = 0;
// The key of the second pull request of the board. That pull request has a ticket.
const TOUR_PR_KEY = 2;
const MY_PRS_KEY = 6;
const DEPLOY_KEY = 7;
const TOUR_STEPS: TourStep[] = [
  { view: "profile", frames: 5 },
  { view: "profile", frames: 3, pressedKey: MY_PRS_KEY },
  { view: "mine", frames: 8 },
  { view: "mine", frames: 3, pressedKey: TOUR_PR_KEY },
  { view: "mine", frames: 3, jiraSeconds: 3, page: "github" },
  { view: "mine", frames: 3, jiraSeconds: 2, pressedKey: TOUR_PR_KEY, page: "github" },
  { view: "mine", frames: 5, page: "jira" },
  { view: "mine", frames: 3, pressedKey: BACK_KEY },
  { view: "profile", frames: 2 },
  { view: "profile", frames: 3, pressedKey: DEPLOY_KEY },
  { view: "deploy", frames: 8 },
  { view: "deploy", frames: 3, pressedKey: BACK_KEY },
];
const TOUR_DECK_TOP = DECK_MARGIN + HEADING_TO_KEYS;
const TOUR_DECK_WIDTH = spanOf(MK2.columns, TOUR_KEY_PIXELS, TOUR_KEY_GAP);
const TOUR_DECK_HEIGHT = spanOf(MK2.rows, TOUR_KEY_PIXELS, TOUR_KEY_GAP);

function tourPoint(index: number): Point {
  const pitch = TOUR_KEY_PIXELS + TOUR_KEY_GAP;
  return [DECK_MARGIN + (index % MK2.columns) * pitch, TOUR_DECK_TOP + Math.floor(index / MK2.columns) * pitch];
}

function blankKey(): string {
  return `<svg><rect width="${KEY_SIZE}" height="${KEY_SIZE}" fill="${BLANK_KEY_COLOR}"/></svg>`;
}

function tourKeys({ view, jiraSeconds }: TourStep, frame: number): string[] {
  if (view === "profile") {
    const keys = Array.from({ length: MK2.columns * MK2.rows }, blankKey);
    keys[MY_PRS_KEY] = renderSummary(mine(BOARD_PRS), DEFAULT_SUMMARY_STYLES.mine, frame);
    keys[DEPLOY_KEY] = renderSummary(deploy(BOARD_DEPLOY_PRS), DEFAULT_SUMMARY_STYLES.deploy, frame);
    return keys;
  }
  const keys =
    view === "mine" ? profileKeys(MY_PRS_BACK, BOARD_PRS, MK2, frame) : profileKeys(DEPLOY_BACK, BOARD_DEPLOY_PRS, MK2, frame);
  if (jiraSeconds !== undefined) keys[TOUR_PR_KEY] = renderJiraWindow("ticket", jiraSeconds);
  return keys;
}

const tenth = (value: number): number => Math.round(value * 10) / 10;

// After the first frame of a press, a ring around the finger shows the press.
function fingerMark(index: number, pressFrame: number): string {
  const [x, y] = tourPoint(index);
  const center = `cx="${tenth(x + TOUR_KEY_PIXELS * FINGER_CENTER[0])}" cy="${tenth(y + TOUR_KEY_PIXELS * FINGER_CENTER[1])}"`;
  const line = `stroke="${FINGER_COLOR}" stroke-width="${FINGER_LINE_WIDTH}"`;
  const ring =
    pressFrame === 0 ? "" : `<circle ${center} r="${tenth(TOUR_KEY_PIXELS * FINGER_RING_RADIUS)}" fill="none" ${line} stroke-opacity="0.45"/>`;
  return `${ring}<circle ${center} r="${tenth(TOUR_KEY_PIXELS * FINGER_RADIUS)}" fill="${FINGER_COLOR}" fill-opacity="0.3" ${line} stroke-opacity="0.9"/>`;
}

// What the two presses on the tour key open.
function browserCards(): Record<BrowserPage, BrowserCard> {
  const pr = BOARD_PRS[TOUR_PR_KEY - 1];
  const { ticket, title } = leadOf(pr, JIRA_PROJECTS);
  return {
    github: { address: `github.com/${pr.owner}/${pr.repository}/pull/${pr.number}`, title, note: `Pull request #${pr.number} on GitHub` },
    jira: { address: `${JIRA_SITE}/browse/${ticket}`, title: `${ticket} ${title}`, note: "The ticket in Jira" },
  };
}

// A small browser window over the last keys of the deck.
function browserCard({ address, title, note }: BrowserCard): string {
  const x = DECK_MARGIN + TOUR_DECK_WIDTH - CARD_WIDTH - CARD_INSET;
  const y = TOUR_DECK_TOP + TOUR_DECK_HEIGHT - CARD_HEIGHT - CARD_INSET;
  const shape = `width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"`;
  const dots = [0, 1, 2]
    .map((dot) => `<circle cx="${x + CARD_DOT_LEFT + dot * CARD_DOT_PITCH}" cy="${y + CARD_DOT_MIDDLE}" r="${CARD_DOT_RADIUS}" fill="${CARD_DOT_COLOR}"/>`)
    .join("");
  const barWidth = CARD_WIDTH - CARD_BAR_LEFT - CARD_BAR_RIGHT;
  return (
    `<rect x="${x + CARD_SHADOW_SHIFT[0]}" y="${y + CARD_SHADOW_SHIFT[1]}" ${shape} fill="${CARD_SHADOW_COLOR}" fill-opacity="0.5"/>` +
    `<rect x="${x}" y="${y}" ${shape} fill="${CARD_COLOR}"/>${dots}` +
    `<rect x="${x + CARD_BAR_LEFT}" y="${y + CARD_BAR_TOP}" width="${barWidth}" height="${CARD_BAR_HEIGHT}" rx="${CARD_BAR_HEIGHT / 2}" fill="${CARD_BAR_COLOR}"/>` +
    label(address, [x + CARD_BAR_LEFT + CARD_BAR_HEIGHT / 2, y + CARD_ADDRESS_BASELINE], CARD_ADDRESS) +
    label(title, [x + CARD_PADDING, y + CARD_TITLE_BASELINE], CARD_TITLE) +
    label(note, [x + CARD_PADDING, y + CARD_NOTE_BASELINE], CARD_NOTE)
  );
}

type Run = { start: number; end: number; markup: string };

// The runs of equal neighbours. A run goes from start to the frame before end.
function runsOf(markups: string[]): Run[] {
  const runs: Run[] = [];
  let start = 0;
  for (let index = 1; index <= markups.length; index++) {
    if (index < markups.length && markups[index] === markups[start]) continue;
    runs.push({ start, end: index, markup: markups[start] });
    start = index;
  }
  return runs;
}

// The CSS that shows a run during its frames and hides it during the others. The loop has frameCount frames.
function runRule(name: string, { start, end }: Run, frameCount: number): string {
  const at = (frame: number, state: string): string => `${Number(((frame / frameCount) * 100).toFixed(4))}%{visibility:${state}}`;
  const steps = [at(0, start === 0 ? "visible" : "hidden")];
  if (start > 0) steps.push(at(start, "visible"));
  if (end < frameCount) steps.push(at(end, "hidden"));
  steps.push(at(frameCount, end < frameCount ? "hidden" : "visible"));
  const seconds = (frameCount * FRAME_MS) / 1000;
  return `@keyframes ${name}{${steps.join("")}}.${name}{animation-name:${name};animation-duration:${seconds}s}`;
}

// The CSS rules of the moving parts of one image, by class name.
type AnimationRules = Map<string, string>;

// A part of an image that loops over its frames, one frame every FRAME_MS. A part that is the same in every
// frame is drawn once. A part that changes is drawn once per run of equal frames, and a CSS animation shows
// each run in its frames. Without the animation, for example with "reduce motion", the part shows its first frame.
function loopMarkup(frames: string[], rules: AnimationRules): string {
  const runs = runsOf(frames);
  if (runs.length === 1) return runs[0].markup;
  return runs
    .filter((run) => run.markup !== "")
    .map((run) => {
      const name = `run-${frames.length}-${run.start}-${run.end}`;
      rules.set(name, runRule(name, run, frames.length));
      return `<g class="run ${name}"${run.start === 0 ? "" : ' visibility="hidden"'}>${run.markup}</g>`;
    })
    .join("");
}

function animationStyle(rules: AnimationRules): string {
  if (rules.size === 0) return "";
  return (
    `<style>.run{animation-timing-function:step-end;animation-iteration-count:infinite}` +
    `${[...rules.values()].join("")}@media (prefers-reduced-motion:reduce){.run{animation:none}}</style>`
  );
}

// Each frame maps a part name to its markup. All the parts share one loop.
function flipbook(width: number, height: number, frames: AnimationFrame[]): string {
  const names = [...new Set(frames.flatMap((frame) => [...frame.keys()]))];
  const rules: AnimationRules = new Map();
  const content = names.map((name) => loopMarkup(frames.map((frame) => frame.get(name) ?? ""), rules)).join("");
  return document(width, height, animationStyle(rules) + content);
}

// One deck, press by press: My PRs, a pull request, its Jira ticket, Back, Deploy.
function tourImage(): string {
  const cards = browserCards();
  const frames: AnimationFrame[] = [];
  for (const step of TOUR_STEPS) {
    for (let pressFrame = 0; pressFrame < step.frames; pressFrame++) {
      const frame: AnimationFrame = new Map();
      frame.set("heading", label(TOUR_HEADINGS[step.view], [DECK_MARGIN, DECK_MARGIN + HEADING_BASELINE], HEADING));
      tourKeys(step, frames.length).forEach((key, index) => frame.set(`key-${index}`, placeKey(key, tourPoint(index), TOUR_KEY_PIXELS)));
      frame.set("finger", step.pressedKey === undefined ? "" : fingerMark(step.pressedKey, pressFrame));
      frame.set("card", step.page === undefined ? "" : browserCard(cards[step.page]));
      frames.push(frame);
    }
  }
  return flipbook(DECK_MARGIN * 2 + TOUR_DECK_WIDTH, TOUR_DECK_TOP + TOUR_DECK_HEIGHT + DECK_MARGIN, frames);
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
write("tour.svg", tourImage());
write("overview.svg", overviewImage());
write("key-anatomy.svg", anatomyImage());
write("states.svg", statesImage());
write("problems.svg", problemsImage());
write("summary-styles.svg", summaryImage(README_SUMMARY_GROUPS));
write("summary-states.svg", summaryImage(SUMMARY_GROUPS));
write("deploy-keys.svg", deployKeysImage());
