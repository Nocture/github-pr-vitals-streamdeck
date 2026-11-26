import { expect, test } from "vitest";
import { circle, keyImage, keySvg, path, rect, SVG_DATA_PREFIX, text } from "./svg";

test("text escapes markup characters", () => {
  expect(text(`a < b & "c" > d`, 10, 20, 18, "#fff")).toContain("a &lt; b &amp; &quot;c&quot; &gt; d");
});

test("a key image decodes back to its SVG", () => {
  const svg = keySvg(rect(0, 0, 144, 144, "#26262a"));
  expect(decodeURIComponent(keyImage(svg).slice(SVG_DATA_PREFIX.length))).toBe(svg);
});

test("text drops control characters that XML cannot hold", () => {
  expect(text("a\u0000b\u001fc\u007fd\ne", 10, 20, 18, "#fff")).toContain(">abcde</text>");
});

test("a stroked path has round caps and no fill", () => {
  expect(path("M0 0 L5 5", { stroke: "#fff", strokeWidth: 3, isRound: true })).toBe(
    '<path d="M0 0 L5 5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  );
});

test("a circle can be a ring", () => {
  expect(circle(10, 10, 5, "none", { stroke: "#fff", strokeWidth: 2 })).toBe(
    '<circle cx="10" cy="10" r="5" fill="none" stroke="#fff" stroke-width="2"/>',
  );
});
