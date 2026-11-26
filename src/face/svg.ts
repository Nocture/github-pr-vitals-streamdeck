export const KEY_SIZE = 144;
export const SVG_DATA_PREFIX = "data:image/svg+xml;charset=utf8,";
const FONT_FAMILY = "Arial";
const FONT_WEIGHT = 700;

type TextAnchor = "start" | "middle" | "end";
type RectOptions = { radius?: number; fillOpacity?: number; stroke?: string; strokeWidth?: number; dash?: string };

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// XML 1.0 cannot hold C0 control characters, even escaped.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function escapeMarkup(content: string): string {
  return content.replace(CONTROL_CHARACTERS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function text(content: string, x: number, baseline: number, size: number, fill: string, anchor: TextAnchor = "start"): string {
  return (
    `<text x="${round1(x)}" y="${round1(baseline)}" text-anchor="${anchor}" font-family="${FONT_FAMILY}" ` +
    `font-size="${size}" font-weight="${FONT_WEIGHT}" fill="${fill}">${escapeMarkup(content)}</text>`
  );
}

export const LINE_HEIGHT = 1.12;
const BASELINE_SHIFT = 0.35;

// One <text> per line. The first line's box starts at top, and each line is LINE_HEIGHT × size tall.
export function textLines(lines: string[], x: number, top: number, size: number, fill: string, anchor: TextAnchor = "start"): string {
  const lineHeight = size * LINE_HEIGHT;
  return lines
    .map((line, index) => text(line, x, top + lineHeight * (index + 0.5) + size * BASELINE_SHIFT, size, fill, anchor))
    .join("");
}

export function rect(x: number, y: number, width: number, height: number, fill: string, options: RectOptions = {}): string {
  const { radius, fillOpacity, stroke, strokeWidth, dash } = options;
  const attributes = [
    `x="${round1(x)}"`,
    `y="${round1(y)}"`,
    `width="${round1(width)}"`,
    `height="${round1(height)}"`,
    `fill="${fill}"`,
  ];
  if (radius !== undefined) attributes.push(`rx="${round1(radius)}"`);
  if (fillOpacity !== undefined) attributes.push(`fill-opacity="${fillOpacity}"`);
  if (stroke !== undefined) attributes.push(`stroke="${stroke}"`);
  if (strokeWidth !== undefined) attributes.push(`stroke-width="${strokeWidth}"`);
  if (dash !== undefined) attributes.push(`stroke-dasharray="${dash}"`);
  return `<rect ${attributes.join(" ")}/>`;
}

type CircleOptions = { stroke?: string; strokeWidth?: number; strokeOpacity?: number };
type PathOptions = CircleOptions & { fill?: string; fillOpacity?: number; isRound?: boolean };

export function circle(cx: number, cy: number, r: number, fill: string, options: CircleOptions = {}): string {
  const { stroke, strokeWidth, strokeOpacity } = options;
  const attributes = [`cx="${round1(cx)}"`, `cy="${round1(cy)}"`, `r="${round1(r)}"`, `fill="${fill}"`];
  if (stroke !== undefined) attributes.push(`stroke="${stroke}"`);
  if (strokeWidth !== undefined) attributes.push(`stroke-width="${round1(strokeWidth)}"`);
  if (strokeOpacity !== undefined) attributes.push(`stroke-opacity="${strokeOpacity}"`);
  return `<circle ${attributes.join(" ")}/>`;
}

export function path(d: string, options: PathOptions = {}): string {
  const { fill = "none", stroke, strokeWidth, fillOpacity, strokeOpacity, isRound = false } = options;
  const attributes = [`d="${d}"`, `fill="${fill}"`];
  if (fillOpacity !== undefined) attributes.push(`fill-opacity="${fillOpacity}"`);
  if (stroke !== undefined) attributes.push(`stroke="${stroke}"`);
  if (strokeWidth !== undefined) attributes.push(`stroke-width="${round1(strokeWidth)}"`);
  if (strokeOpacity !== undefined) attributes.push(`stroke-opacity="${strokeOpacity}"`);
  if (isRound) attributes.push(`stroke-linecap="round"`, `stroke-linejoin="round"`);
  return `<path ${attributes.join(" ")}/>`;
}

export function group(content: string, opacity: number): string {
  return `<g opacity="${opacity}">${content}</g>`;
}

export function keySvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">${content}</svg>`;
}

export function keyImage(svg: string): string {
  return SVG_DATA_PREFIX + encodeURIComponent(svg);
}
