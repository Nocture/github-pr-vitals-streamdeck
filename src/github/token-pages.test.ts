import { expect, test } from "vitest";
import { TOKEN_PAGE_URL } from "./token-pages";

test("the token page is the form for a classic token, with the scopes that the plugin needs filled in", () => {
  const page = new URL(TOKEN_PAGE_URL);
  expect(`${page.origin}${page.pathname}`).toBe("https://github.com/settings/tokens/new");
  expect(page.searchParams.get("scopes")).toBe("repo,read:org");
});
