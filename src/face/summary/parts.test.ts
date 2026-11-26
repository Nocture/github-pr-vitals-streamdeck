import { expect, test } from "vitest";
import { svgTexts } from "../../test-support";
import { RUNNING } from "../colors";
import { chipRow, countChip, headerBand, kindArea, stripes, runningArea } from "./parts";

const TOLERANCE = 0.1;

function pathPoints(markup: string): [number, number][] {
  const points: [number, number][] = [];
  for (const [, data] of markup.matchAll(/<path d="([^"]+)"/g)) {
    for (const [, x, y] of data.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) points.push([Number(x), Number(y)]);
  }
  return points;
}

test.each([30, 64, 136])("every stripe stays inside its area at width %i", (width) => {
  for (const height of [25, 33, 53, 144]) {
    for (let frame = 0; frame < 4; frame++) {
      const points = pathPoints(stripes(4, 30, width, height, frame));
      expect(points.length).toBeGreaterThan(0);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(4 - TOLERANCE);
        expect(x).toBeLessThanOrEqual(4 + width + TOLERANCE);
        expect(y).toBeGreaterThanOrEqual(30 - TOLERANCE);
        expect(y).toBeLessThanOrEqual(30 + height + TOLERANCE);
      }
    }
  }
});

test("stripes move from one frame to the next", () => {
  expect(stripes(0, 0, 100, 25, 0)).not.toEqual(stripes(0, 0, 100, 25, 1));
});

test("a failing area blinks and a conflicts area does not", () => {
  expect(kindArea("failing", 0, 0, 10, 10, 0)).not.toEqual(kindArea("failing", 0, 0, 10, 10, 1));
  expect(kindArea("conflicts", 0, 0, 10, 10, 0)).toEqual(kindArea("conflicts", 0, 0, 10, 10, 1));
});

test.each([
  [0.5, 50],
  [0, 15],
])("the running area fills to the share, at least 15 %%: share %f", (share, expectedWidth) => {
  const fill = new RegExp(`<rect [^>]*width="${expectedWidth}"[^>]*fill="${RUNNING}"`);
  expect(runningArea(0, 0, 100, 25, 0, { share })).toMatch(fill);
});

test("the band shows the name, the count and the GitHub cap", () => {
  const band = headerBand("My PRs", "passed", 0, 0, "27");
  expect(svgTexts(band)).toEqual(["My PRs", "27"]);
  expect(band).toMatch(/<rect x="116"[^>]*fill-opacity="0.28"/);
});

test("a chip row falls back to 18 px when it is too wide", () => {
  const loud = countChip(["failing", 100]);
  expect(chipRow([loud, loud, loud, loud], 0, 113)).toContain('font-size="18"');
  expect(chipRow([loud], 0, 113)).toContain('font-size="20"');
});
