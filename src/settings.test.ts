import { describe, expect, test, vi } from "vitest";
import { githubTokenOf, jiraBrowseUrl, jiraConfigOf, jiraSiteHost, validOwnerChoices, validRepoColors } from "./settings";

vi.mock("@elgato/streamdeck", async () => (await import("./test-support")).streamDeckMock);

describe("jiraBrowseUrl", () => {
  test.each([
    "https://example.atlassian.net",
    "https://example.atlassian.net/",
    "example.atlassian.net",
    "  https://example.atlassian.net//  ",
  ])("builds the browse address from any form of the site: %j", (site) => {
    expect(jiraBrowseUrl(site, "ABC-1")).toBe("https://example.atlassian.net/browse/ABC-1");
  });

  test.each(["", undefined])("returns null when the site is %j", (site) => {
    expect(jiraBrowseUrl(site, "ABC-1")).toBeNull();
  });

  test.each(["https://", "https:///", "file:///x", "foo://", "file://server", "ftp://host"])(
    "a site with no host, or a scheme other than http and https, has no browse address: %j",
    (site) => {
      expect(jiraBrowseUrl(site, "ABC-1")).toBeNull();
    },
  );
});

test("a token of spaces counts as no token", () => {
  expect(githubTokenOf({ githubToken: "   " })).toBeNull();
});

test("removes whitespace and control characters from the token", () => {
  expect(githubTokenOf({ githubToken: " ghp_ab\u0000c\r\nd\te\u007f " })).toBe("ghp_abcde");
});

test("ignores saved colours that are not #rrggbb", () => {
  const saved = { billing: "#38BDF8", webshop: 'red"/><x', constructor: "#fb923c", web: 7 };
  expect(validRepoColors(saved)).toEqual({ billing: "#38bdf8", constructor: "#fb923c" });
});

test("keeps only boolean choices for GitHub logins", () => {
  // JSON.parse makes "__proto__" an own key. In an object literal it would set the prototype.
  const choices = validOwnerChoices(JSON.parse('{"Acme": false, "octo-1": true, "bad name": true, "constructor": "yes", "__proto__": true}'));
  expect({ ...choices }).toEqual({ Acme: false, "octo-1": true });
  expect({ ...validOwnerChoices("nope") }).toEqual({});
});

describe("jiraSiteHost", () => {
  test.each(["example.atlassian.net", "https://example.atlassian.net/", " http://example.atlassian.net// "])(
    "reads the host of %j",
    (site) => {
      expect(jiraSiteHost(site)).toBe("example.atlassian.net");
    },
  );

  test.each(["", undefined, "https://", "https:///", "file:///x", "foo://", "file://server", "ftp://host"])("has no host for %j", (site) => {
    expect(jiraSiteHost(site)).toBeNull();
  });
});

describe("jiraConfigOf", () => {
  const complete = { jiraSite: "example.atlassian.net", jiraEmail: "me@example.com", jiraToken: "secret", jiraProjects: "abc, XYZ" };

  test("reads the host, credentials and projects", () => {
    expect(jiraConfigOf({ ...complete, jiraToken: " sec\tret\n" })).toEqual({
      host: "example.atlassian.net",
      credentials: { email: "me@example.com", token: "secret" },
      projects: ["ABC", "XYZ"],
    });
  });

  test.each(["jiraSite", "jiraEmail", "jiraToken", "jiraProjects"] as const)(
    "Jira is configured only with site, email, token and projects: no %s",
    (missing) => {
      expect(jiraConfigOf({ ...complete, [missing]: undefined })).toBeNull();
    },
  );
});
