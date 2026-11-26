import { cutToWidth } from "./fit-text";
import { DIM, JIRA_BLUE, NEUTRAL, OFF_WHITE, RUNNING_TEXT, SOFT, UNLIT, WHITE, ZERO_VALUE } from "./colors";
import { circle, keySvg, KEY_SIZE, path, rect, text } from "./svg";

const CENTER = KEY_SIZE / 2;
const NOTICE_WIDTH = 116;
const EMPTY_SLOT_BACKGROUND = "#141416";
const EMPTY_SLOT_BORDER = "#2c2c2f";
const NOTHING_TO_OPEN_BACKGROUND = "#232325";
const JIRA_COUNTDOWN = "#c9dcff";

function background(color: string): string {
  return rect(0, 0, KEY_SIZE, KEY_SIZE, color);
}

function centered(content: string, baseline: number, size: number, fill: string): string {
  return text(content, CENTER, baseline, size, fill, "middle");
}

const EMPTY_SLOT_FRAME =
  background(EMPTY_SLOT_BACKGROUND) +
  rect(10, 10, 124, 124, "none", { radius: 14, stroke: EMPTY_SLOT_BORDER, strokeWidth: 2, dash: "6 6" });

export function renderEmptySlot(): string {
  return keySvg(EMPTY_SLOT_FRAME + centered("No PR", 78, 17, UNLIT));
}

// The notice says why there is no data, for example "offline" or "paused to 14:05".
export function renderNoData(notice: string): string {
  return keySvg(
    EMPTY_SLOT_FRAME +
      centered("No data", 66, 17, SOFT) +
      centered(cutToWidth(notice, NOTICE_WIDTH, 14), 90, 14, RUNNING_TEXT),
  );
}

function mergeIcon(cx: number, cy: number, color: string): string {
  const stroke = { stroke: color, strokeWidth: 2.5 };
  return (
    circle(cx - 6, cy - 7, 3, "none", stroke) +
    circle(cx - 6, cy + 7, 3, "none", stroke) +
    circle(cx + 6, cy + 1, 3, "none", stroke) +
    path(`M${cx - 6} ${cy - 4} V${cy + 4} M${cx - 6} ${cy - 4} Q${cx - 6} ${cy + 1} ${cx + 3} ${cy + 1}`, stroke)
  );
}

export function renderNothingApproved(): string {
  return keySvg(
    background(NEUTRAL) +
      mergeIcon(CENTER, 48, ZERO_VALUE) +
      centered("Nothing", 92, 19, SOFT) +
      centered("approved yet", 114, 16, DIM),
  );
}

export function renderOverflow(count: number): string {
  return keySvg(
    background(NEUTRAL) +
      centered(`+${count}`, 72, 44, OFF_WHITE) +
      centered("more PRs", 100, 18, SOFT) +
      centered("on GitHub", 122, 15, DIM),
  );
}

const BACK_CHEVRON = path("M83 38 L61 58 L83 78", { stroke: OFF_WHITE, strokeWidth: 8, isRound: true });

// The label names the list that the deck shows, for example "my PRs".
export function renderBack(label: string | null): string {
  const labelLine = label === null ? "" : centered(label, 126, 13, DIM);
  return keySvg(background(NEUTRAL) + BACK_CHEVRON + centered("Back", 106, 20, OFF_WHITE) + labelLine);
}

export type TokenFace = "missing" | "expired" | "sso" | "noAccess";

export const TOKEN_FACES: Record<TokenFace, { keyColor: string; lines: [string, string] }> = {
  missing: { keyColor: SOFT, lines: ["Add a", "token"] },
  expired: { keyColor: RUNNING_TEXT, lines: ["Token", "expired"] },
  sso: { keyColor: RUNNING_TEXT, lines: ["Token", "needs SSO"] },
  noAccess: { keyColor: RUNNING_TEXT, lines: ["Token", "no access"] },
};

export function renderTokenFace(face: TokenFace): string {
  const { keyColor, lines } = TOKEN_FACES[face];
  const keyIcon =
    circle(52, 48, 13, "none", { stroke: keyColor, strokeWidth: 6 }) +
    `<path d="M65 48 H98 M88 48 V59 M97 48 V56" fill="none" stroke="${keyColor}" stroke-width="6" stroke-linecap="round"/>`;
  return keySvg(
    background(NEUTRAL) +
      keyIcon +
      centered(lines[0], 90, 20, OFF_WHITE) +
      centered(lines[1], 112, 20, OFF_WHITE) +
      centered("press to fix", 133, 13, DIM),
  );
}

export type JiraWindowKind = "ticket" | "noTicket" | "noSite";
type JiraWindowFace = { backgroundColor: string; textColor: string; countdownColor: string; lines: [string, string] };

const JIRA_WINDOW_FACES: Record<JiraWindowKind, JiraWindowFace> = {
  ticket: { backgroundColor: JIRA_BLUE, textColor: WHITE, countdownColor: JIRA_COUNTDOWN, lines: ["Press again", "to open JIRA"] },
  noTicket: { backgroundColor: NOTHING_TO_OPEN_BACKGROUND, textColor: OFF_WHITE, countdownColor: DIM, lines: ["No JIRA", "ticket"] },
  noSite: { backgroundColor: NOTHING_TO_OPEN_BACKGROUND, textColor: OFF_WHITE, countdownColor: DIM, lines: ["Set the", "JIRA site"] },
};

// The face of a key in its Jira window. See SlotAction.
export function renderJiraWindow(kind: JiraWindowKind, secondsLeft: number): string {
  const { backgroundColor, textColor, countdownColor, lines } = JIRA_WINDOW_FACES[kind];
  return keySvg(
    background(backgroundColor) +
      centered(lines[0], 50, 20, textColor) +
      centered(lines[1], 74, 20, textColor) +
      centered(`${secondsLeft}s`, 122, 40, countdownColor),
  );
}
