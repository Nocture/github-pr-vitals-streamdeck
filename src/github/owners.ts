import { MY_PRS_SEARCH } from "./query";
import type { Viewer } from "./types";

export type OwnerOption = { login: string; isOwnAccount: boolean; isShown: boolean };

export function isOwnerShown(login: string, viewerLogin: string, choices: Record<string, boolean>): boolean {
  return Object.hasOwn(choices, login) ? choices[login] : login !== viewerLogin;
}

export function ownerSearch(viewerLogin: string, choices: Record<string, boolean>): string {
  const hiddenLogins = [...new Set([viewerLogin, ...Object.keys(choices)])]
    .filter((login) => !isOwnerShown(login, viewerLogin, choices))
    .sort();
  return [MY_PRS_SEARCH, ...hiddenLogins.map((login) => `-user:${login}`)].join(" ");
}

export function ownerOptions(viewer: Viewer, seenOwners: string[], choices: Record<string, boolean>): OwnerOption[] {
  const otherLogins = [...new Set([...viewer.organizations, ...seenOwners, ...Object.keys(choices)])]
    .filter((login) => login !== viewer.login)
    .sort((first, second) => first.localeCompare(second));
  return [viewer.login, ...otherLogins].map((login) => ({
    login,
    isOwnAccount: login === viewer.login,
    isShown: isOwnerShown(login, viewer.login, choices),
  }));
}
