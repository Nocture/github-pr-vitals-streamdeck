import streamDeck from "@elgato/streamdeck";
import { BUILD_LABEL } from "./build";
import { fetchTokenStatus, GitHubUnauthorizedError } from "./github/client";
import { TOKEN_PAGE_URL } from "./github/token-pages";
import type { OwnerOption } from "./github/owners";
import { fetchCloudId, JiraUnauthorizedError, testJiraCredentials } from "./jira/client";
import { JIRA_INTERVAL_MS } from "./jira/statuses";
import { messageOf } from "./log";
import { POLL_INTERVAL_MS } from "./poller";
import { githubTokenOf, jiraConfigOf, loadGlobalSettings } from "./settings";

export type PropertyInspectorRequest =
  | { event: "openTokenPage" }
  | { event: "testToken" }
  | { event: "testJira" }
  | { event: "getBuild" }
  | { event: "getStatus" }
  | { event: "setRepoColor"; repo: string; color: string }
  | { event: "getOwners" }
  | { event: "setOwnerShown"; login: string; isShown: boolean };

export interface PropertyInspectorHost {
  setRepoColor(repo: string, color: string): Promise<void>;
  lastUpdateMs(): number | null;
  lastJiraUpdateMs(): number | null;
  isJiraConfigured(): boolean;
  ownerOptions(): OwnerOption[];
  setOwnerShown(login: string, isShown: boolean): Promise<void>;
}

const NO_TOKEN_MESSAGE = "Add a token first.";
const REFUSED_TOKEN_MESSAGE = "GitHub refused the token.";
const NO_JIRA_CONFIG_MESSAGE = "Fill in the Jira site, email, token and projects first.";
const REFUSED_JIRA_TOKEN_MESSAGE = "Jira refused the token.";

export async function answerPropertyInspector(request: PropertyInspectorRequest, host: PropertyInspectorHost): Promise<void> {
  switch (request.event) {
    case "getBuild":
      await streamDeck.ui.sendToPropertyInspector({ event: "build", label: BUILD_LABEL });
      break;
    case "openTokenPage":
      await streamDeck.system.openUrl(TOKEN_PAGE_URL);
      break;
    case "testToken":
      await streamDeck.ui.sendToPropertyInspector({ event: "tokenStatus", ...(await testToken()) });
      break;
    case "testJira":
      await streamDeck.ui.sendToPropertyInspector({ event: "jiraStatus", ...(await testJira()) });
      break;
    case "getStatus":
      await streamDeck.ui.sendToPropertyInspector({
        event: "status",
        githubUpdatedMs: host.lastUpdateMs(),
        githubIntervalMs: POLL_INTERVAL_MS,
        isJiraConfigured: host.isJiraConfigured(),
        jiraUpdatedMs: host.lastJiraUpdateMs(),
        jiraIntervalMs: JIRA_INTERVAL_MS,
      });
      break;
    case "setRepoColor":
      await host.setRepoColor(request.repo, request.color);
      break;
    case "getOwners":
      await streamDeck.ui.sendToPropertyInspector({ event: "owners", owners: host.ownerOptions() });
      break;
    case "setOwnerShown":
      await host.setOwnerShown(request.login, request.isShown);
      break;
  }
}

async function testToken(): Promise<{ login: string; remaining: number; limit: number } | { error: string }> {
  const token = githubTokenOf(await loadGlobalSettings());
  if (!token) return { error: NO_TOKEN_MESSAGE };
  try {
    return await fetchTokenStatus(token);
  } catch (error) {
    if (error instanceof GitHubUnauthorizedError) return { error: REFUSED_TOKEN_MESSAGE };
    return { error: messageOf(error) };
  }
}

async function testJira(): Promise<{ ok: true } | { error: string }> {
  const config = jiraConfigOf(await loadGlobalSettings());
  if (config === null) return { error: NO_JIRA_CONFIG_MESSAGE };
  try {
    await testJiraCredentials(config.credentials, await fetchCloudId(config.host));
    return { ok: true };
  } catch (error) {
    if (error instanceof JiraUnauthorizedError) return { error: REFUSED_JIRA_TOKEN_MESSAGE };
    return { error: messageOf(error) };
  }
}
