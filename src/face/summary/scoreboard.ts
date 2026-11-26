import type { DeploySummary, MySummary } from "../../prs/summary";
import { minePipeline } from "../../prs/summary";
import { BOARD, FAINT, PASSED, TILE_OFF, WHITE } from "../colors";
import { KEY_SIZE, rect, text } from "../svg";
import { fitSize, headerBand, kindArea, kindAreaColor, kindIcon, type FaceKind } from "./parts";

const TILE_LEFT = 6;
const TILE_TOP = 29;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 53;
const TILE_GAP = 4;
const TILE_RADIUS = 6;
const TILE_ICON_RADIUS = 6.5;
const TILE_ICON_X = 13;
const TILE_ICON_Y = 14;
const VALUE_RIGHT = 7;
const VALUE_BOTTOM = 9;
const VALUE_MAX_SIZE = 32;
const VALUE_SIDE_PADDING = 12;
const CALM_TOTAL = PASSED;
const BUSY_TOTAL = "#34343a";
const DRAFTS_TOTAL = "#2a2a2f";

type Tile = { kind: FaceKind; count: number; fill?: string; share?: number };

function tile(index: number, { kind, count, fill, share }: Tile, frame: number): string {
  const x = TILE_LEFT + (index % 2) * (TILE_WIDTH + TILE_GAP);
  const y = TILE_TOP + Math.floor(index / 2) * (TILE_HEIGHT + TILE_GAP);
  const isLit = fill !== undefined || count > 0;
  const area = fill
    ? rect(x, y, TILE_WIDTH, TILE_HEIGHT, fill, { radius: TILE_RADIUS })
    : isLit
      ? kindArea(kind, x, y, TILE_WIDTH, TILE_HEIGHT, frame, { radius: TILE_RADIUS, share })
      : rect(x, y, TILE_WIDTH, TILE_HEIGHT, TILE_OFF, { radius: TILE_RADIUS });
  const ink = isLit ? WHITE : FAINT;
  const iconBackground = isLit ? kindAreaColor(kind) : TILE_OFF;
  const value = String(count);
  return (
    area +
    kindIcon(kind, x + TILE_ICON_X, y + TILE_ICON_Y, TILE_ICON_RADIUS, ink, iconBackground) +
    text(
      value,
      x + TILE_WIDTH - VALUE_RIGHT,
      y + TILE_HEIGHT - VALUE_BOTTOM,
      fitSize(value, VALUE_MAX_SIZE, TILE_WIDTH - VALUE_SIDE_PADDING),
      ink,
      "end",
    )
  );
}

function tiles(list: Tile[], frame: number): string {
  return list.map((entry, index) => tile(index, entry, frame)).join("");
}

function totalFill(summary: MySummary): string {
  if (summary.ready === 0) return DRAFTS_TOTAL;
  const isCalm = summary.failing === 0 && summary.conflicts === 0 && summary.running === 0;
  return isCalm ? CALM_TOTAL : BUSY_TOTAL;
}

export function scoreboardMine(summary: MySummary, frame: number): string {
  const share = summary.runningShare;
  return (
    rect(0, 0, KEY_SIZE, KEY_SIZE, BOARD) +
    headerBand("My PRs", minePipeline(summary), share, frame) +
    tiles(
      [
        { kind: "open", count: summary.open, fill: totalFill(summary) },
        { kind: "failing", count: summary.failing },
        { kind: "conflicts", count: summary.conflicts },
        { kind: "running", count: summary.running, share },
      ],
      frame,
    )
  );
}

export function scoreboardDeploy(summary: DeploySummary, frame: number): string {
  const share = summary.runningShare;
  const pipelineTile: Tile =
    summary.failing > 0
      ? { kind: "failing", count: summary.failing }
      : { kind: "running", count: summary.running, share };
  return (
    rect(0, 0, KEY_SIZE, KEY_SIZE, BOARD) +
    headerBand("Deploy", summary.pipeline, share, frame) +
    tiles(
      [
        { kind: "ready", count: summary.ready },
        { kind: "conflicts", count: summary.conflicts },
        { kind: "behind", count: summary.behind },
        pipelineTile,
      ],
      frame,
    )
  );
}
