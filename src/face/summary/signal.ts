import type { DeploySummary, MySummary, SummaryPipeline } from "../../prs/summary";
import { deployProblems, minePipeline, mineProblems } from "../../prs/summary";
import {
  BLOCKED,
  DIM,
  DRAFT,
  NO_CHECKS,
  PASSED,
  PASSED_SHADE,
  PASSED_TEXT,
  REVIEW,
  SOFT,
  WHITE,
  ZERO_VALUE,
} from "../colors";
import { KEY_SIZE, rect, text } from "../svg";
import {
  BAND_HEIGHT,
  bandLabels,
  chipRow,
  countChip,
  fitSize,
  headerBand,
  KIND_WORDS,
  kindArea,
  type FaceKind,
} from "./parts";

type BackgroundKind = FaceKind | "calm" | "nothing";

const NO_CHECKS_PIPELINES: SummaryPipeline[] = ["noChecks", "none"];
const BAND_SHADES: Partial<Record<SummaryPipeline, string>> = {
  failing: "#5e1310",
  running: "#6b4100",
  passed: PASSED_SHADE,
};
const FLAT_BACKGROUNDS: Partial<Record<BackgroundKind, string>> = {
  ready: PASSED,
  behind: BLOCKED,
  calm: REVIEW,
  noChecks: NO_CHECKS,
};
const AREA_BACKGROUNDS: BackgroundKind[] = ["failing", "conflicts", "running"];
const BODY_CENTER = KEY_SIZE / 2;
const VALUE_BASELINE = 82;
const VALUE_MAX_SIZE = 64;
const VALUE_MAX_WIDTH = 124;
const WORD_BASELINE = 104;
const WORD_SIZE = 20;
const CHIPS_TOP = 113;

function background(kind: BackgroundKind, frame: number, share: number): string {
  if (AREA_BACKGROUNDS.includes(kind)) return kindArea(kind as FaceKind, 0, 0, KEY_SIZE, KEY_SIZE, frame, { share });
  return rect(0, 0, KEY_SIZE, KEY_SIZE, FLAT_BACKGROUNDS[kind] ?? DRAFT);
}

// When the key behind the band has the colour of the band, the band takes a darker shade, or the neutral band
// colour for no checks. So the key always shows two colours.
function band(
  name: string,
  count: string | null,
  pipeline: SummaryPipeline,
  backgroundKind: BackgroundKind,
  frame: number,
  share: number,
): string {
  const backgroundPipeline = backgroundKind === "ready" ? "passed" : backgroundKind;
  const shade = BAND_SHADES[pipeline];
  if (shade && pipeline === backgroundPipeline) {
    return rect(0, 0, KEY_SIZE, BAND_HEIGHT, shade) + bandLabels(name, count);
  }
  const isNoChecksOnNoChecks = backgroundKind === "noChecks" && NO_CHECKS_PIPELINES.includes(pipeline);
  return headerBand(name, isNoChecksOnNoChecks ? "neutral" : pipeline, share, frame, count);
}

function body(value: string, word: string, wordColor: string, valueColor = WHITE): string {
  return (
    text(value, BODY_CENTER, VALUE_BASELINE, fitSize(value, VALUE_MAX_SIZE, VALUE_MAX_WIDTH), valueColor, "middle") +
    text(word, BODY_CENTER, WORD_BASELINE, WORD_SIZE, wordColor, "middle")
  );
}

export function signalMine(summary: MySummary, frame: number): string {
  const problems = mineProblems(summary);
  const [first] = problems;
  const hasOnlyDrafts = summary.ready === 0 && summary.drafts > 0;
  const backgroundKind: BackgroundKind = first?.[0] ?? (hasOnlyDrafts ? "drafts" : "calm");
  const share = summary.runningShare;
  let face =
    background(backgroundKind, frame, share) +
    band("My PRs", String(summary.open), minePipeline(summary), backgroundKind, frame, share);
  if (first) face += body(String(first[1]), KIND_WORDS[first[0]], WHITE);
  else if (summary.ready > 0) face += body(String(summary.ready), "all green", PASSED_TEXT);
  else if (hasOnlyDrafts) face += body(String(summary.drafts), "drafts only", SOFT);
  else face += body("0", "no PRs", DIM, ZERO_VALUE);
  return face + chipRow(problems.slice(1).map(countChip), frame, CHIPS_TOP);
}

export function signalDeploy(summary: DeploySummary, frame: number): string {
  const blockers = deployProblems(summary);
  const [firstBlocker] = blockers;
  const backgroundKind: BackgroundKind = summary.ready > 0 ? "ready" : (firstBlocker?.[0] ?? "nothing");
  const share = summary.runningShare;
  const approved = summary.approved > 0 ? String(summary.approved) : null;
  const face =
    background(backgroundKind, frame, share) + band("Deploy", approved, summary.pipeline, backgroundKind, frame, share);
  if (summary.ready > 0) {
    return face + body(String(summary.ready), KIND_WORDS.ready, WHITE) + chipRow(blockers.map(countChip), frame, CHIPS_TOP);
  }
  if (firstBlocker) {
    return (
      face +
      body(String(firstBlocker[1]), KIND_WORDS[firstBlocker[0]], WHITE) +
      chipRow(blockers.slice(1).map(countChip), frame, CHIPS_TOP)
    );
  }
  return face + body("0", "approved", DIM, ZERO_VALUE);
}
