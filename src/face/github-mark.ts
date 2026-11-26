// The path of mark-github-16 in @primer/octicons 19.15.0. Its MIT notice is in the THIRD-PARTY-NOTICES.txt of the
// plugin folder. The mark is a GitHub logo, so GitHub's logo guidelines apply to its use.
const GITHUB_MARK_PATH =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const MARK_SIZE = 16;

const ARGUMENT_COUNTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const PATH_TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
const IS_COMMAND = /[A-Za-z]/;

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Moves and scales the numbers in the path, so the SVG needs no transform. Arc flags and rotation stay as they are.
export function placePath(path: string, scale: number, dx: number, dy: number): string {
  const tokens = path.match(PATH_TOKEN) ?? [];
  const parts: string[] = [];
  let command = "";
  let index = 0;
  while (index < tokens.length) {
    let prefix = "";
    if (IS_COMMAND.test(tokens[index])) {
      command = tokens[index++];
      prefix = command;
      if (command.toUpperCase() === "Z") {
        parts.push(command);
        continue;
      }
    } else if (command === "M" || command === "m") {
      command = command === "M" ? "L" : "l";
      prefix = command;
    }
    const upper = command.toUpperCase();
    const isAbsolute = command === upper;
    const count = ARGUMENT_COUNTS[upper];
    const values = tokens.slice(index, index + count).map(Number);
    index += count;
    const x = (value: number) => roundTo2(isAbsolute ? value * scale + dx : value * scale);
    const y = (value: number) => roundTo2(isAbsolute ? value * scale + dy : value * scale);
    let numbers: number[];
    if (upper === "H") numbers = [x(values[0])];
    else if (upper === "V") numbers = [y(values[0])];
    else if (upper === "A")
      numbers = [roundTo2(values[0] * scale), roundTo2(values[1] * scale), values[2], values[3], values[4], x(values[5]), y(values[6])];
    else numbers = values.map((value, position) => (position % 2 ? y(value) : x(value)));
    parts.push(prefix + numbers.join(" "));
  }
  return parts.join(" ");
}

export function githubMark(cx: number, cy: number, size: number, color: string): string {
  const d = placePath(GITHUB_MARK_PATH, size / MARK_SIZE, cx - size / 2, cy - size / 2);
  return `<path d="${d}" fill="${color}"/>`;
}
