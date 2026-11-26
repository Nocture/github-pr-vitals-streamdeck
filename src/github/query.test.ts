import { expect, test } from "vitest";
import { MY_PRS_QUERY, VIEWER_LOGIN_QUERY, VIEWER_QUERY } from "./query";

// A fine-grained token cannot read commit objects or git refs, but it can read the rollup on the pull request.
test.each([MY_PRS_QUERY, VIEWER_QUERY, VIEWER_LOGIN_QUERY])("asks only for what a fine-grained token can read", (query) => {
  expect(query).not.toMatch(/\bcommits\b/);
  expect(query).not.toMatch(/Ref\s*\{/);
});

test("reads the rollup on the pull request", () => {
  expect(MY_PRS_QUERY).toMatch(/mergeStateStatus[\s\S]*statusCheckRollup \{ state/);
});
