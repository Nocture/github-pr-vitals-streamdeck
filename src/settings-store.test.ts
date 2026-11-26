import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import { SETTINGS_RETRY_MS, SettingsStore } from "./settings-store";
import { stage, streamDeckMock } from "./test-support";

vi.mock("@elgato/streamdeck", async () => (await import("./test-support")).streamDeckMock);

const { setGlobalSettings, onDidReceiveGlobalSettings, getGlobalSettings } = streamDeckMock.default.settings;
const warn = streamDeckMock.default.logger.warn;
const TOKEN = "ghp_secret";

let onReceive: Mock<() => void>;
let store: SettingsStore;

function savedSettings() {
  return setGlobalSettings.mock.lastCall?.[0] as Record<string, unknown>;
}

function receive(settings: object): void {
  const listener = onDidReceiveGlobalSettings.mock.lastCall?.[0] as (ev: { settings: object }) => void;
  listener({ settings });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stage.globalSettings = { githubToken: TOKEN, repoColors: { "mobile-app": "#fb923c", webshop: "#a3e635" } };
  onReceive = vi.fn<() => void>();
  store = new SettingsStore(onReceive);
});

describe("after the first load", () => {
  beforeEach(() => store.start());

  test("a settings write that drops the saved colours gets them back", () => {
    receive({ githubToken: TOKEN, jiraSite: "x" });
    expect(setGlobalSettings).toHaveBeenCalledOnce();
    expect(savedSettings()).toMatchObject({ jiraSite: "x", repoColors: { "mobile-app": "#fb923c" } });
  });

  test("a settings event with the same owned fields in another key order writes nothing", () => {
    receive({ githubToken: TOKEN, repoColors: { webshop: "#a3e635", "mobile-app": "#fb923c" }, ownerChoices: {} });
    expect(setGlobalSettings).not.toHaveBeenCalled();
  });

  test("the settings page can change a repo colour", () => {
    expect(store.setRepoColor("mobile-app", "#38bdf8")).toBe(true);
    expect(savedSettings()).toMatchObject({ githubToken: TOKEN, repoColors: { "mobile-app": "#38bdf8" } });
    expect(store.repoColor("mobile-app")).toBe("#38bdf8");
  });

  test.each([
    ["an unsaved repo", "unknown-repo", "#38bdf8"],
    ["a colour that is not #rrggbb", "mobile-app", "blue"],
  ])("a colour choice for %s changes nothing", (_name, repo, color) => {
    expect(store.setRepoColor(repo, color)).toBe(false);
    expect(setGlobalSettings).not.toHaveBeenCalled();
    expect(store.repoColor("mobile-app")).toBe("#fb923c");
  });
});

test("nothing is written before the settings load", () => {
  expect(store.setRepoColor("billing", "#38bdf8")).toBe(false);
  expect(store.setOwnerShown("Nocture", true)).toBe(false);
  expect(setGlobalSettings).not.toHaveBeenCalled();
});

test("tries the settings again when the first load fails", async () => {
  getGlobalSettings.mockRejectedValueOnce(new Error("Stream Deck is not connected"));
  await store.start();
  expect(warn).toHaveBeenCalledWith("Settings load failed: Stream Deck is not connected");
  expect(onReceive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(SETTINGS_RETRY_MS);
  expect(onReceive).toHaveBeenCalledOnce();
  expect(store.settings).toMatchObject({ githubToken: TOKEN });
});
