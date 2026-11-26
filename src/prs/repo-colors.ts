export const REPO_PALETTE = [
  "#a3e635",
  "#f472b6",
  "#fb923c",
  "#38bdf8",
  "#a78bfa",
  "#2dd4bf",
  "#e879f9",
  "#facc15",
  "#94a3b8",
];

export const fallbackRepoColor = REPO_PALETTE[REPO_PALETTE.length - 1];

export function assignRepoColors(repos: string[], known: Record<string, string>): Record<string, string> {
  // Without a prototype, a repo named "constructor" or "__proto__" is an ordinary key.
  const colors: Record<string, string> = Object.assign(Object.create(null), known);
  const usedColors = new Set(Object.values(colors));
  for (const repo of repos) {
    if (Object.hasOwn(colors, repo)) continue;
    const freeColor = REPO_PALETTE.find((color) => !usedColors.has(color));
    colors[repo] = freeColor ?? fallbackRepoColor;
    usedColors.add(colors[repo]);
  }
  return colors;
}
