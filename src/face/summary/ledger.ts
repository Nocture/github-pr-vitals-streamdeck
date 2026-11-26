import type { DeploySummary, MySummary } from "../../prs/summary";
import { deployProblems, mineProblems } from "../../prs/summary";
import { DRAFT_TEXT, NEUTRAL, QUIET_AREA, REVIEW, WHITE } from "../colors";
import { cutToWidth, textWidth } from "../fit-text";
import { KEY_SIZE, rect, text } from "../svg";
import { fitSize, headerBand, KIND_WORDS, kindArea, kindAreaColor, kindIcon, type FaceKind } from "./parts";

const ROW_LEFT = 4;
const ROW_WIDTH = 136;
const ROW_TOP = 30;
const ROW_HEIGHT = 33;
const ROW_GAP = 4;
const ROW_RADIUS = 6;
const MAX_ROWS = 3;
const ICON_X = 17;
const ICON_RADIUS = 7;
const COUNT_X = 28;
const COUNT_SIZE = 22;
const WORD_GAP = 4;
const WORD_MAX_SIZE = 19;
const WORD_MIN_SIZE = 18;
const WORD_RIGHT_LIMIT = 137;
const BASELINE_BELOW_CENTER = 8;

type Row = { kind: FaceKind; count: number; word: string; share?: number; isQuiet?: boolean };

function row(kind: FaceKind, count: number, share?: number): Row {
  return { kind, count, word: KIND_WORDS[kind], share };
}

function quietRow(kind: FaceKind, count: number, word: string): Row {
  return { kind, count, word, isQuiet: true };
}

function drawRow(index: number, { kind, count, word, share, isQuiet }: Row, frame: number): string {
  const y = ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
  const centerY = y + ROW_HEIGHT / 2;
  const area = isQuiet
    ? rect(ROW_LEFT, y, ROW_WIDTH, ROW_HEIGHT, QUIET_AREA, { radius: ROW_RADIUS })
    : kindArea(kind, ROW_LEFT, y, ROW_WIDTH, ROW_HEIGHT, frame, { radius: ROW_RADIUS, share });
  const ink = isQuiet ? DRAFT_TEXT : WHITE;
  const iconBackground = isQuiet ? QUIET_AREA : kindAreaColor(kind);
  const value = String(count);
  const wordLeft = COUNT_X + textWidth(value, COUNT_SIZE) + WORD_GAP;
  const wordWidth = WORD_RIGHT_LIMIT - wordLeft;
  const wordSize = fitSize(word, WORD_MAX_SIZE, wordWidth, WORD_MIN_SIZE);
  const baseline = centerY + BASELINE_BELOW_CENTER;
  return (
    area +
    kindIcon(kind, ICON_X, centerY, ICON_RADIUS, ink, iconBackground) +
    text(value, COUNT_X, baseline, COUNT_SIZE, ink) +
    text(cutToWidth(word, wordWidth, wordSize), wordLeft, baseline, wordSize, ink)
  );
}

function rows(list: Row[], frame: number): string {
  return list.map((entry, index) => drawRow(index, entry, frame)).join("");
}

export function ledgerMine(summary: MySummary, frame: number): string {
  const problems = mineProblems(summary).map(([kind, count]) => row(kind, count, summary.runningShare));
  const quiet: Row[] = [];
  if (problems.length === 0) {
    if (summary.passed > 0) quiet.push(row("passed", summary.passed));
    if (summary.noChecks > 0) quiet.push(row("noChecks", summary.noChecks));
    if (summary.drafts > 0) quiet.push(quietRow("drafts", summary.drafts, KIND_WORDS.drafts));
    if (summary.open === 0) quiet.push(quietRow("open", 0, KIND_WORDS.open));
  }
  return (
    rect(0, 0, KEY_SIZE, KEY_SIZE, REVIEW) +
    headerBand("My PRs", "neutral", summary.runningShare, frame, String(summary.open)) +
    rows([...problems, ...quiet].slice(0, MAX_ROWS), frame)
  );
}

export function ledgerDeploy(summary: DeploySummary, frame: number): string {
  const share = summary.runningShare;
  let list = [row("ready", summary.ready, share), ...deployProblems(summary).map(([kind, count]) => row(kind, count, share))].filter(
    (entry) => entry.count > 0,
  );
  if (list.length > MAX_ROWS) {
    const otherCount = list.slice(MAX_ROWS - 1).reduce((total, entry) => total + entry.count, 0);
    list = [...list.slice(0, MAX_ROWS - 1), quietRow("noChecks", otherCount, "other")];
  }
  if (list.length === 0) {
    list = [quietRow("noChecks", 0, "approved")];
  }
  const approved = summary.approved > 0 ? String(summary.approved) : null;
  return (
    rect(0, 0, KEY_SIZE, KEY_SIZE, NEUTRAL) + headerBand("Deploy", "neutral", share, frame, approved) + rows(list, frame)
  );
}
