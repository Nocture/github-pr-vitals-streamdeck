import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { bundledProfileFiles, type PluginManifest, profileEntries, stableUuid, type ZipEntry, zipFiles } from "./profile-files";
import { BUNDLED_PROFILES, type ProfileLayout } from "./profiles";

const SLOT_ID = "com.nocture.prvitals.pr-slot";
const BACK_ID = "com.nocture.prvitals.back";
const MANIFEST: PluginManifest = {
  Name: "GitHub PR Vitals",
  UUID: "com.nocture.prvitals",
  Version: "1.2.3.4",
  Actions: [
    { Name: "PR slot", UUID: SLOT_ID },
    { Name: "Back", UUID: BACK_ID },
  ],
};
const LAYOUT: ProfileLayout = { name: "PR Vitals", model: "20GAT9901", columns: 8, rows: 4, hasEncoders: false, slotActionUuid: SLOT_ID };
const SEED = "profiles/PR Vitals XL";
const KEY_COUNT = 32;
const PLUGIN_FOLDER = new URL("../com.nocture.prvitals.sdPlugin/", import.meta.url);
const PROFILE_MANIFEST_PATH = /^Profiles\/[^/]+\.sdProfile\/manifest\.json$/;
const VERSION_5_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const END_RECORD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const DEFLATED = 8;

type KeyAction = { ActionID: string; Name: string; UUID: string; Plugin: unknown };
type ProfileManifest = { Pages: { Pages: string[] } };
type PageManifest = { Controllers: { Actions: Record<string, KeyAction> | null; Type: string }[] };

function fileAt(entries: ZipEntry[], matches: (path: string) => boolean): { path: string; content: string } {
  const entry = entries.find((candidate) => matches(candidate.path));
  if (entry?.kind !== "file") throw new Error("The entries have no such file");
  return entry;
}

// Follows the profile manifest to its key page, the way Stream Deck finds it.
function keyPageOf(entries: ZipEntry[]): PageManifest {
  const profile = fileAt(entries, (path) => PROFILE_MANIFEST_PATH.test(path));
  const page = (JSON.parse(profile.content) as ProfileManifest).Pages.Pages[0];
  const pagePath = profile.path.replace(/manifest\.json$/, `Profiles/${page.toUpperCase()}/manifest.json`);
  return JSON.parse(fileAt(entries, (path) => path === pagePath).content) as PageManifest;
}

function keyActionsOf(entries: ZipEntry[]): Record<string, KeyAction> {
  return keyPageOf(entries).Controllers[0].Actions ?? {};
}

function actionIdsOf(entries: ZipEntry[]): string[] {
  return Object.values(keyActionsOf(entries)).map((action) => action.ActionID);
}

// Reads each entry the way an unzip tool does: from the central directory, through the local header.
function unzipped(zip: Buffer): { path: string; content: string }[] {
  const end = zip.length - END_RECORD_SIZE;
  const count = zip.readUInt16LE(end + 10);
  let central = zip.readUInt32LE(end + 16);
  const files = [];
  for (let index = 0; index < count; index++) {
    const nameLength = zip.readUInt16LE(central + 28);
    const path = zip.toString("utf8", central + CENTRAL_HEADER_SIZE, central + CENTRAL_HEADER_SIZE + nameLength);
    const local = zip.readUInt32LE(central + 42);
    const dataStart = local + LOCAL_HEADER_SIZE + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + zip.readUInt32LE(central + 20));
    const isDeflated = zip.readUInt16LE(central + 10) === DEFLATED;
    files.push({ path, content: (isDeflated ? inflateRawSync(data) : data).toString("utf8") });
    central += CENTRAL_HEADER_SIZE + nameLength + zip.readUInt16LE(central + 30) + zip.readUInt16LE(central + 32);
  }
  return files;
}

let entries: ZipEntry[];

beforeEach(() => {
  entries = profileEntries(SEED, LAYOUT, MANIFEST);
});

afterEach(() => {
  vi.useRealTimers();
});

test("puts Back top left and a slot on every other key", () => {
  const actions = keyActionsOf(entries);
  const slotKeys = Object.values(actions).filter((action) => action.UUID === SLOT_ID);

  expect(Object.keys(actions)).toHaveLength(KEY_COUNT);
  expect(actions["0,0"]).toMatchObject({ UUID: BACK_ID, Name: "Back" });
  expect(actions["7,3"]).toMatchObject({ UUID: SLOT_ID, Name: "PR slot" });
  expect(slotKeys).toHaveLength(KEY_COUNT - 1);
});

test("the Mini profile has Back and five slots", () => {
  const { manifestName, layout } = BUNDLED_PROFILES.mine[1]!;
  const actions = keyActionsOf(profileEntries(manifestName, layout, MANIFEST));

  expect(Object.keys(actions).sort()).toEqual(["0,0", "0,1", "1,0", "1,1", "2,0", "2,1"]);
  expect(actions["0,0"].UUID).toBe(BACK_ID);
  expect(Object.values(actions).filter((action) => action.UUID === SLOT_ID)).toHaveLength(5);
});

test("the Plus profile has an empty encoder controller", () => {
  const { manifestName, layout } = BUNDLED_PROFILES.mine[7]!;
  const controllers = keyPageOf(profileEntries(manifestName, layout, MANIFEST)).Controllers;

  expect(controllers.map(({ Type }) => Type)).toEqual(["Keypad", "Encoder"]);
  expect(controllers[1].Actions).toBeNull();
});

test("a profile for a deck without encoders has only the keypad controller", () => {
  expect(keyPageOf(entries).Controllers.map(({ Type }) => Type)).toEqual(["Keypad"]);
});

test("names the plugin and its version in every action", () => {
  const plugins = Object.values(keyActionsOf(entries)).map((action) => action.Plugin);

  expect(plugins).toEqual(Array(KEY_COUNT).fill({ Name: "GitHub PR Vitals", UUID: "com.nocture.prvitals", Version: "1.2.3.4" }));
});

test("gives the same ids for the same profile", () => {
  const ids = actionIdsOf(entries);

  expect(ids).toHaveLength(KEY_COUNT);
  expect(actionIdsOf(profileEntries(SEED, LAYOUT, MANIFEST))).toEqual(ids);
});

test("gives different ids for different keys", () => {
  expect(new Set(actionIdsOf(entries)).size).toBe(KEY_COUNT);
});

test("gives different ids for different seeds", () => {
  const otherIds = actionIdsOf(profileEntries("profiles/PR Deploy XL", LAYOUT, MANIFEST));

  expect(otherIds.filter((id) => actionIdsOf(entries).includes(id))).toEqual([]);
});

test("stableUuid has the version 5 layout", () => {
  const seeds = ["", "PR Vitals", "PR Vitals/page", "PR Deploy/7,3", "a", "b", "c", "d"];

  for (const seed of seeds) expect(stableUuid(seed)).toMatch(VERSION_5_UUID);
});

test("the zip holds every entry under its path", () => {
  const expected = entries.map((entry) =>
    entry.kind === "file" ? { path: entry.path, content: entry.content } : { path: `${entry.path}/`, content: "" },
  );

  expect(unzipped(zipFiles(entries))).toEqual(expected);
});

test("the zip is the same on every run", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T08:00:00Z"));
  const first = zipFiles(entries);
  vi.setSystemTime(new Date("2027-06-15T13:45:31Z"));

  expect(first.length).toBeGreaterThan(0);
  expect(zipFiles(entries)).toEqual(first);
});

test("the committed profile files are built from the current manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", PLUGIN_FOLDER), "utf8")) as PluginManifest & { Profiles: object[] };
  const bundled = Object.values(BUNDLED_PROFILES).flatMap((byDeviceType) =>
    Object.entries(byDeviceType).map(([deviceType, profile]) => ({
      Name: profile!.manifestName,
      DeviceType: Number(deviceType),
      AutoInstall: false,
      DontAutoSwitchWhenInstalled: true,
    })),
  );
  const files = bundledProfileFiles(manifest);

  const byName = (a: { Name: string }, b: { Name: string }) => a.Name.localeCompare(b.Name);

  expect(bundled).toHaveLength(10);
  expect((manifest.Profiles as { Name: string }[]).toSorted(byName)).toEqual(bundled.toSorted(byName));
  expect(files.map(({ path }) => path)).toEqual(bundled.map(({ Name }) => `${Name}.streamDeckProfile`));
  for (const { path, zip } of files) {
    const isCurrent = readFileSync(new URL(path, PLUGIN_FOLDER)).equals(zip);
    expect(isCurrent, `${path} does not match the manifest. Run \`npm run profiles\`.`).toBe(true);
  }
});
