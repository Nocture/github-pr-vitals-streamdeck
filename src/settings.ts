import streamDeck from "@elgato/streamdeck";
import type { JiraCredentials } from "./jira/types";
import { parseJiraProjects } from "./prs/derive";

// A key has no settings of its own. All settings are global; see GlobalSettings.
export type KeySettings = Record<string, never>;

export type GlobalSettings = {
  githubToken?: string;
  jiraSite?: string;
  jiraEmail?: string;
  jiraToken?: string;
  jiraProjects?: string;
  repoColors?: Record<string, string>;
  ownerChoices?: Record<string, boolean>;
  mineStyle?: string;
  deployStyle?: string;
};

export const REPO_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const DEFAULT_SCHEME = "https://";
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const WEB_PROTOCOLS = ["http:", "https:"];
// A GitHub or Jira token holds none of these. Node's fetch puts a header value with a control character,
// so the whole token, in its error message.
const WHITESPACE_AND_CONTROL_CHARACTERS = /[\s\p{Cc}]/gu;

export function loadGlobalSettings(): Promise<GlobalSettings> {
  return streamDeck.settings.getGlobalSettings<GlobalSettings>();
}

export function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  return streamDeck.settings.setGlobalSettings<GlobalSettings>(settings);
}

export function validRepoColors(value: unknown): Record<string, string> {
  // Without a prototype, a repo named "constructor" or "__proto__" is an ordinary key.
  const colors: Record<string, string> = Object.create(null);
  if (typeof value !== "object" || value === null) return colors;
  for (const [repo, color] of Object.entries(value)) {
    if (typeof color === "string" && REPO_COLOR_PATTERN.test(color)) colors[repo] = color.toLowerCase();
  }
  return colors;
}

const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9-]+$/;

export function validOwnerChoices(value: unknown): Record<string, boolean> {
  const choices: Record<string, boolean> = Object.create(null);
  if (typeof value !== "object" || value === null) return choices;
  for (const [login, isShown] of Object.entries(value)) {
    if (typeof isShown === "boolean" && GITHUB_LOGIN_PATTERN.test(login)) choices[login] = isShown;
  }
  return choices;
}

function withoutWhitespaceAndControlCharacters(value: string | undefined): string | null {
  return value?.replace(WHITESPACE_AND_CONTROL_CHARACTERS, "") || null;
}

export function githubTokenOf(settings: GlobalSettings): string | null {
  return withoutWhitespaceAndControlCharacters(settings.githubToken);
}

function jiraSiteAddress(site: string | undefined): string | null {
  const trimmed = site?.trim();
  if (!trimmed) return null;
  const address = SCHEME_PATTERN.test(trimmed) ? trimmed : DEFAULT_SCHEME + trimmed;
  if (!URL.canParse(address)) return null;
  const { protocol, host } = new URL(address);
  return WEB_PROTOCOLS.includes(protocol) && host !== "" ? address.replace(/\/+$/, "") : null;
}

export function jiraBrowseUrl(site: string | undefined, ticket: string): string | null {
  const address = jiraSiteAddress(site);
  return address === null ? null : `${address}/browse/${ticket}`;
}

export function jiraSiteHost(site: string | undefined): string | null {
  const address = jiraSiteAddress(site);
  return address === null ? null : new URL(address).host;
}

export type JiraConfig = { host: string; credentials: JiraCredentials; projects: string[] };

export function jiraConfigOf(settings: GlobalSettings): JiraConfig | null {
  const host = jiraSiteHost(settings.jiraSite);
  const email = settings.jiraEmail?.trim();
  const token = withoutWhitespaceAndControlCharacters(settings.jiraToken);
  const projects = parseJiraProjects(settings.jiraProjects);
  if (host === null || !email || token === null || projects.length === 0) return null;
  return { host, credentials: { email, token }, projects };
}
