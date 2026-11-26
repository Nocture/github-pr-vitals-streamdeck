import { expect, test } from "vitest";
import { isOwnerShown, ownerOptions, ownerSearch } from "./owners";

test("hides the own account and shows organisations by default", () => {
  expect(isOwnerShown("Nocture", "Nocture", {})).toBe(false);
  expect(isOwnerShown("Acme", "Nocture", {})).toBe(true);
});

test("builds the search that leaves out hidden owners", () => {
  expect(ownerSearch("Nocture", { Acme: false })).toBe("is:pr is:open author:@me sort:created-desc -user:Acme -user:Nocture");
  expect(ownerSearch("Nocture", { Nocture: true })).toBe("is:pr is:open author:@me sort:created-desc");
});

test("lists the own account first, then every other owner once", () => {
  const viewer = { login: "Nocture", organizations: ["Zeta", "Acme"] };
  const options = ownerOptions(viewer, ["Acme", "octo"], { Old: false });
  expect(options.map((option) => option.login)).toEqual(["Nocture", "Acme", "octo", "Old", "Zeta"]);
  expect(options[0]).toEqual({ login: "Nocture", isOwnAccount: true, isShown: false });
  expect(options[3]).toEqual({ login: "Old", isOwnAccount: false, isShown: false });
});
