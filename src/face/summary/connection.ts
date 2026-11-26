import { NEUTRAL, RUNNING_TEXT, SOFT, STALE_STRIP, UNLIT, WHITE } from "../colors";
import { textWidth } from "../fit-text";
import { TOKEN_FACES, type TokenFace } from "../other-faces";
import { circle, group, keySvg, path, rect, text } from "../svg";
import { headerBand } from "./parts";

export const SUMMARY_NAMES = { mine: "My PRs", deploy: "Deploy" };

export type StaleNotice = { kind: "offline"; text: string } | { kind: "paused"; untilText: string };

const CENTER = 72;
const DOT_XS = [52, 72, 92];
const DOT_Y = 74;
const DOT_RADIUS = 7;
const LOADING_BASELINE = 118;
const KEY_ICON_CENTER_X = 70;
const KEY_ICON_CENTER_Y = 60;
const KEY_ICON_STROKE = 5.5;
const TOKEN_LINE_SIZE = 22;
const TOKEN_LINE_BASELINES = [104, 128];
const NOTICE_SIZE = 18;
const STALE_OPACITY = 0.4;
const STALE_STRIP_TOP = 112;
const STALE_STRIP_HEIGHT = 32;
const OFFLINE_BASELINE = 134;
const PAUSED_BASELINE = 135;
const PAUSE_BAR_TOP = 121;
const PAUSE_BAR_WIDTH = 5;
const PAUSE_BAR_HEIGHT = 16;
const PAUSE_BAR_GAP = 9;
const PAUSE_SIGN_WIDTH = 21;
const OPENING_SVG_TAG = /^<svg[^>]*>/;
const CLOSING_SVG_TAG = /<\/svg>$/;

function neutralFrame(name: string): string {
  return rect(0, 0, 144, 144, NEUTRAL) + headerBand(name, "neutral", 0, 0);
}

function chaseDots(frame: number): string {
  return DOT_XS.map((x, index) => circle(x, DOT_Y, DOT_RADIUS, index === frame % DOT_XS.length ? WHITE : UNLIT)).join("");
}

function summaryKeyIcon(cx: number, cy: number, color: string): string {
  return (
    circle(cx - 17, cy, 11, "none", { stroke: color, strokeWidth: KEY_ICON_STROKE }) +
    path(`M${cx - 6} ${cy} H${cx + 22} M${cx + 14} ${cy} V${cy + 9} M${cx + 21} ${cy} V${cy + 7}`, {
      stroke: color,
      strokeWidth: KEY_ICON_STROKE,
      isRound: true,
    })
  );
}

export function renderSummaryLoading(name: string, frame: number): string {
  return keySvg(neutralFrame(name) + chaseDots(frame) + text("Loading", CENTER, LOADING_BASELINE, 20, SOFT, "middle"));
}

export function renderSummaryToken(name: string, face: TokenFace): string {
  const { keyColor, lines } = TOKEN_FACES[face];
  return keySvg(
    neutralFrame(name) +
      summaryKeyIcon(KEY_ICON_CENTER_X, KEY_ICON_CENTER_Y, keyColor) +
      lines.map((line, index) => text(line, CENTER, TOKEN_LINE_BASELINES[index], TOKEN_LINE_SIZE, WHITE, "middle")).join(""),
  );
}

function pausedNotice(content: string): string {
  const left = CENTER - (PAUSE_SIGN_WIDTH + textWidth(content, NOTICE_SIZE)) / 2;
  const bar = (x: number) => rect(x, PAUSE_BAR_TOP, PAUSE_BAR_WIDTH, PAUSE_BAR_HEIGHT, RUNNING_TEXT, { radius: 1 });
  return bar(left) + bar(left + PAUSE_BAR_GAP) + text(content, left + PAUSE_SIGN_WIDTH, PAUSED_BASELINE, NOTICE_SIZE, RUNNING_TEXT);
}

export function renderSummaryStale(face: string, name: string, notice: StaleNotice): string {
  const content = face.replace(OPENING_SVG_TAG, "").replace(CLOSING_SVG_TAG, "");
  const message =
    notice.kind === "offline"
      ? text(notice.text, CENTER, OFFLINE_BASELINE, NOTICE_SIZE, RUNNING_TEXT, "middle")
      : pausedNotice(notice.untilText);
  return keySvg(
    group(content, STALE_OPACITY) +
      headerBand(name, "neutral", 0, 0) +
      rect(0, STALE_STRIP_TOP, 144, STALE_STRIP_HEIGHT, STALE_STRIP) +
      message,
  );
}
