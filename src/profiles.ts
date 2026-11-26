import type { DeviceType } from "@elgato/streamdeck";

export type ListKind = "mine" | "deploy";
export type ProfileLayout = {
  name: string;
  model: string;
  columns: number;
  rows: number;
  hasEncoders: boolean;
  slotActionUuid: string;
};

// manifestName is the Name of the profile in the Profiles of the manifest. switchToProfile only finds those.
type BundledProfile = { manifestName: string; layout: ProfileLayout };

// scripts/make-profiles.ts loads this file. The SDK hides the errors of a script when it loads,
// so this file imports only the SDK types. The type checks each value.
const STREAM_DECK_MK2: DeviceType.StreamDeck = 0;
const STREAM_DECK_MINI: DeviceType.StreamDeckMini = 1;
const STREAM_DECK_XL: DeviceType.StreamDeckXL = 2;
const STREAM_DECK_PLUS: DeviceType.StreamDeckPlus = 7;
const STREAM_DECK_NEO: DeviceType.StreamDeckNeo = 9;

export const SLOT_ACTION_UUIDS: Record<ListKind, string> = {
  mine: "com.nocture.prvitals.pr-slot",
  deploy: "com.nocture.prvitals.deploy-slot",
};
export const SUMMARY_ACTION_UUIDS: Record<ListKind, string> = {
  mine: "com.nocture.prvitals.summary-mine",
  deploy: "com.nocture.prvitals.summary-deploy",
};
export const BACK_ACTION_UUID = "com.nocture.prvitals.back";

// Stream Deck installs a bundled profile once and never replaces it,
// so a changed layout needs a new profile file name.
// The model only labels the file. Stream Deck picks the deck by the DeviceType in the manifest.
const DECKS = [
  { deviceType: STREAM_DECK_MK2, suffix: "MK2", model: "20GBA9901", columns: 5, rows: 3, hasEncoders: false },
  { deviceType: STREAM_DECK_MINI, suffix: "Mini", model: "20GAI9901", columns: 3, rows: 2, hasEncoders: false },
  { deviceType: STREAM_DECK_XL, suffix: "XL", model: "20GAT9901", columns: 8, rows: 4, hasEncoders: false },
  { deviceType: STREAM_DECK_PLUS, suffix: "Plus", model: "20GBD9901", columns: 4, rows: 2, hasEncoders: true },
  { deviceType: STREAM_DECK_NEO, suffix: "Neo", model: "20GBJ9901", columns: 4, rows: 2, hasEncoders: false },
];
const LIST_NAMES: Record<ListKind, string> = { mine: "PR Vitals", deploy: "PR Deploy" };

function bundledProfilesOf(list: ListKind): Partial<Record<number, BundledProfile>> {
  return Object.fromEntries(
    DECKS.map(({ deviceType, suffix, ...keypad }) => [
      deviceType,
      { manifestName: `profiles/${LIST_NAMES[list]} ${suffix}`, layout: { name: LIST_NAMES[list], ...keypad, slotActionUuid: SLOT_ACTION_UUIDS[list] } },
    ]),
  );
}

export const BUNDLED_PROFILES: Record<ListKind, Partial<Record<number, BundledProfile>>> = {
  mine: bundledProfilesOf("mine"),
  deploy: bundledProfilesOf("deploy"),
};

export function bundledProfileOf(list: ListKind, deviceType: number): string | null {
  return BUNDLED_PROFILES[list][deviceType]?.manifestName ?? null;
}
