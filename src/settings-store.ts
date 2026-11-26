import streamDeck from "@elgato/streamdeck";
import { messageOf, warnOnFailure } from "./log";
import { assignRepoColors, fallbackRepoColor } from "./prs/repo-colors";
import {
  type GlobalSettings,
  loadGlobalSettings,
  REPO_COLOR_PATTERN,
  saveGlobalSettings,
  validOwnerChoices,
  validRepoColors,
} from "./settings";

export const SETTINGS_RETRY_MS = 5_000;

/**
 * The global settings. Only the plugin writes two fields: repoColors and ownerChoices.
 * After the first load, the plugin's copy of these two fields wins. A write that drops or changes them gets them back.
 */
export class SettingsStore {
  private currentSettings: GlobalSettings = {};
  private repoColors: Record<string, string> = {};
  private currentOwnerChoices: Record<string, boolean> = {};
  private isLoaded = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  // onReceive runs after the first load and after each settings event.
  constructor(private readonly onReceive: () => void) {}

  get settings(): GlobalSettings {
    return this.currentSettings;
  }

  get ownerChoices(): Record<string, boolean> {
    return this.currentOwnerChoices;
  }

  repoColor(repo: string): string {
    return Object.hasOwn(this.repoColors, repo) ? this.repoColors[repo] : fallbackRepoColor;
  }

  async start(): Promise<void> {
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => this.receive(ev.settings));
    await this.load();
  }

  // Returns whether the colour was saved. Only a repo that already has a colour can get another one.
  setRepoColor(repo: string, color: string): boolean {
    if (!this.isLoaded || !Object.hasOwn(this.repoColors, repo) || !REPO_COLOR_PATTERN.test(color)) return false;
    this.repoColors = Object.assign(Object.create(null), this.repoColors, { [repo]: color.toLowerCase() });
    this.saveOwnedFields();
    return true;
  }

  // Returns whether the choice was saved. The caller checks that the login is a known owner.
  setOwnerShown(login: string, isShown: boolean): boolean {
    if (!this.isLoaded || typeof isShown !== "boolean") return false;
    this.currentOwnerChoices = { ...this.currentOwnerChoices, [login]: isShown };
    this.saveOwnedFields();
    return true;
  }

  colorNewRepos(repos: string[]): void {
    const colors = assignRepoColors(repos, this.repoColors);
    if (Object.keys(colors).length === Object.keys(this.repoColors).length) return;
    this.repoColors = colors;
    this.saveOwnedFields();
  }

  private async load(): Promise<void> {
    try {
      this.receive(await loadGlobalSettings());
    } catch (error) {
      streamDeck.logger.warn(`Settings load failed: ${messageOf(error)}`);
      if (this.isLoaded) return;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.load();
      }, SETTINGS_RETRY_MS);
    }
  }

  private receive(settings: GlobalSettings): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.apply(settings);
    this.onReceive();
  }

  private apply(settings: GlobalSettings): void {
    if (!this.isLoaded) {
      this.isLoaded = true;
      this.repoColors = Object.assign(Object.create(null), validRepoColors(settings.repoColors));
      this.currentOwnerChoices = validOwnerChoices(settings.ownerChoices);
      this.currentSettings = settings;
    } else if (this.isOwnedFieldsChanged(settings)) {
      this.saveOwnedFields(settings);
    } else {
      this.currentSettings = settings;
    }
  }

  private isOwnedFieldsChanged(settings: GlobalSettings): boolean {
    return !isSameRecord(settings.repoColors, this.repoColors) || !isSameRecord(settings.ownerChoices, this.currentOwnerChoices);
  }

  private saveOwnedFields(base: GlobalSettings = this.currentSettings): void {
    this.currentSettings = { ...base, repoColors: this.repoColors, ownerChoices: this.currentOwnerChoices };
    void warnOnFailure(saveGlobalSettings(this.currentSettings), "Settings save");
  }
}

// A missing record counts as empty. The key order does not count.
function isSameRecord<Value>(incoming: Record<string, Value> | undefined, current: Record<string, Value>): boolean {
  const incomingKeys = Object.keys(incoming ?? {});
  return incomingKeys.length === Object.keys(current).length && incomingKeys.every((key) => incoming?.[key] === current[key]);
}
