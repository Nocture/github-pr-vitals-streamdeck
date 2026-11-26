import { TEXT_WIDTHS } from "./text-widths";

export type FitStep = { size: number; maxLines: number };
type FittedText = { size: number; lines: string[] };

const CUT_MARK = "…";
// A character that is not in the table (an emoji, CJK) counts this wide, in units of the font size.
// On Windows, Segoe UI Emoji draws an emoji 1.373 em wide, so the guess is never too narrow there.
const UNKNOWN_CHARACTER_WIDTH = 1.4;

export function textWidth(text: string, size: number): number {
  return Array.from(text).reduce((total, character) => total + (TEXT_WIDTHS[character] ?? UNKNOWN_CHARACTER_WIDTH), 0) * size;
}

// Tries the steps in order and takes the first size at which the text fits. At the last step it cuts with "…".
export function fitText(text: string, width: number, steps: FitStep[]): FittedText {
  const words = text.trim().split(/\s+/).filter((word) => word);
  if (words.length === 0) return { size: steps[0].size, lines: [] };
  for (const { size, maxLines } of steps) {
    const lines = wrapWords(words, width, size);
    if (lines.length <= maxLines) return { size, lines };
  }
  const { size, maxLines } = steps[steps.length - 1];
  const lines = wrapWords(words, width, size).slice(0, maxLines);
  lines[maxLines - 1] = cutLine(lines[maxLines - 1], width, size);
  return { size, lines };
}

// Keeps the text on one line, and cuts it with "…" when it is wider than the width.
export function cutToWidth(text: string, width: number, size: number): string {
  return textWidth(text, size) <= width ? text : cutLine(text, width, size);
}

function wrapWords(words: string[], width: number, size: number): string[] {
  const fits = (line: string) => textWidth(line, size) <= width;
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const joined = current ? current + " " + word : word;
    if (fits(joined)) {
      current = joined;
      continue;
    }
    if (current) lines.push(current);
    let rest = word;
    while (!fits(rest)) {
      const head = longestFittingStart(rest, fits);
      lines.push(head);
      rest = rest.slice(head.length);
    }
    current = rest;
  }
  lines.push(current);
  return lines;
}

// At least one character, so that a line that is too narrow for any character still ends.
function longestFittingStart(word: string, fits: (line: string) => boolean): string {
  const characters = Array.from(word);
  let length = Math.max(1, characters.length - 1);
  while (length > 1 && !fits(characters.slice(0, length).join(""))) length -= 1;
  return characters.slice(0, length).join("");
}

function cutLine(line: string, width: number, size: number): string {
  let characters = Array.from(line);
  while (characters.length > 0 && textWidth(characters.join("").trimEnd() + CUT_MARK, size) > width) {
    characters = characters.slice(0, -1);
  }
  return characters.join("").trimEnd() + CUT_MARK;
}
