import { describe, expect, test } from "vitest";
import { assignRepoColors, REPO_PALETTE } from "./repo-colors";

describe("assignRepoColors", () => {
  test("keeps known colours and gives a new repo the first free one", () => {
    const colors = assignRepoColors(["billing", "webshop", "atlas"], { billing: "#38bdf8" });

    expect(colors).toEqual({ billing: "#38bdf8", webshop: "#a3e635", atlas: "#f472b6" });
  });

  test.each(["constructor", "__proto__"])("gives a repo named %s its own colour", (repo) => {
    const colors = assignRepoColors([repo], {});

    expect(colors[repo]).toBe("#a3e635");
  });

  test("gives the last colour when the palette is used up", () => {
    const repos = [...REPO_PALETTE.map((_color, index) => `repo${index}`), "extra"];

    const colors = assignRepoColors(repos, {});

    expect(colors["repo0"]).toBe("#a3e635");
    expect(colors["extra"]).toBe("#94a3b8");
  });
});
