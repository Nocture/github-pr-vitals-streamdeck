import { createHash } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { BACK_ACTION_UUID, BUNDLED_PROFILES, type ProfileLayout } from "./profiles";

// Builds the .streamDeckProfile files that the plugin bundles (see BUNDLED_PROFILES).
// The format copies a script-built profile that Stream Deck 7 installs.

export type PluginManifest = { Name: string; UUID: string; Version: string; Actions: { Name: string; UUID: string }[] };
export type ZipEntry = { kind: "file"; path: string; content: string } | { kind: "directory"; path: string };

const PROFILE_EXTENSION = ".streamDeckProfile";
const UUID_NAMESPACE = "com.nocture.prvitals/profiles/";
const BACK_KEY = "0,0";
const PROFILE_VERSION = "3.0";
const NO_CURRENT_PAGE = "00000000-0000-0000-0000-000000000000";
const EXPORTING_APP = { AppVersion: "7.1.0.0", FormatVersion: 1, OSType: "Windows", OSVersion: "10.0.19045" };
const KEY_STATE = {
  FontFamily: "",
  FontSize: 12,
  FontStyle: "",
  FontUnderline: false,
  OutlineThickness: 2,
  ShowTitle: false,
  TitleAlignment: "bottom",
  TitleColor: "#ffffff",
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const STORED = 0;
const DEFLATED = 8;
const DOS_DATE_1980_01_01 = 0x0021;
const DOS_TIME_MIDNIGHT = 0;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;

/** The same seed always gives the same id. The version and variant bits follow RFC 9562 version 5. */
export function stableUuid(seed: string): string {
  const bytes = createHash("sha1").update(UUID_NAMESPACE + seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/** Each bundled profile file, with its path inside the plugin folder. */
export function bundledProfileFiles(manifest: PluginManifest): { path: string; zip: Buffer }[] {
  return Object.values(BUNDLED_PROFILES)
    .flatMap((byDeviceType) => Object.values(byDeviceType))
    .filter((profile) => profile !== undefined)
    .map(({ manifestName, layout }) => ({ path: manifestName + PROFILE_EXTENSION, zip: zipFiles(profileEntries(manifestName, layout, manifest)) }));
}

export function profileEntries(idSeed: string, layout: ProfileLayout, manifest: PluginManifest): ZipEntry[] {
  const profileId = stableUuid(idSeed);
  const defaultPageId = stableUuid(`${idSeed}/default page`);
  const pageId = stableUuid(`${idSeed}/page`);
  const profileFolder = `Profiles/${profileId.toUpperCase()}.sdProfile`;
  const pagesFolder = `${profileFolder}/Profiles`;
  const profileManifest = {
    Device: { Model: layout.model, UUID: "" },
    Name: layout.name,
    Pages: { Current: NO_CURRENT_PAGE, Default: defaultPageId, Pages: [pageId] },
    Version: PROFILE_VERSION,
  };
  const packageInfo = { ...EXPORTING_APP, DeviceModel: layout.model, DeviceSettings: null, RequiredPlugins: [manifest.UUID] };
  return [
    jsonFile("package.json", packageInfo),
    directory("Profiles"),
    directory(profileFolder),
    jsonFile(`${profileFolder}/manifest.json`, profileManifest),
    directory(pagesFolder),
    ...pageEntries(`${pagesFolder}/${defaultPageId.toUpperCase()}`, null, layout),
    ...pageEntries(`${pagesFolder}/${pageId.toUpperCase()}`, keyActions(idSeed, layout, manifest), layout),
  ];
}

function keyActions(idSeed: string, layout: ProfileLayout, manifest: PluginManifest): Record<string, object> {
  const plugin = { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version };
  const actions: Record<string, object> = {};
  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      const key = `${column},${row}`;
      const actionUuid = key === BACK_KEY ? BACK_ACTION_UUID : layout.slotActionUuid;
      actions[key] = {
        ActionID: stableUuid(`${idSeed}/${key}`),
        LinkedTitle: true,
        Name: actionNameOf(manifest, actionUuid),
        Plugin: plugin,
        Resources: null,
        Settings: {},
        State: 0,
        States: [KEY_STATE],
        UUID: actionUuid,
      };
    }
  }
  return actions;
}

function actionNameOf(manifest: PluginManifest, actionUuid: string): string {
  const action = manifest.Actions.find((candidate) => candidate.UUID === actionUuid);
  if (action === undefined) throw new Error(`The plugin manifest has no action ${actionUuid}`);
  return action.Name;
}

// Each page has an Images folder, as in the profiles that Stream Deck 7 installs. Here it stays empty.
function pageEntries(folder: string, actions: Record<string, object> | null, layout: ProfileLayout): ZipEntry[] {
  const controllers = [{ Actions: actions, Type: "Keypad" }, ...(layout.hasEncoders ? [{ Actions: null, Type: "Encoder" }] : [])];
  const page = { Controllers: controllers, Icon: "", Name: "" };
  return [directory(folder), directory(`${folder}/Images`), jsonFile(`${folder}/manifest.json`, page)];
}

function jsonFile(path: string, value: object): ZipEntry {
  return { kind: "file", path, content: JSON.stringify(value) };
}

function directory(path: string): ZipEntry {
  return { kind: "directory", path };
}

// Every entry has the same fixed date, so the same entries always give the same bytes.
export function zipFiles(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const isFile = entry.kind === "file";
    const name = Buffer.from(isFile ? entry.path : `${entry.path}/`);
    const data = isFile ? Buffer.from(entry.content) : Buffer.alloc(0);
    const stored = isFile ? deflateRawSync(data) : data;
    const header = sharedHeader(isFile ? DEFLATED : STORED, isFile ? crc32(data) : 0, stored.length, data.length, name.length);

    const local = Buffer.concat([uint32(LOCAL_HEADER_SIGNATURE), header, name, stored]);
    const centralFields = Buffer.alloc(14);
    centralFields.writeUInt32LE(isFile ? 0 : DOS_DIRECTORY_ATTRIBUTE, 6);
    centralFields.writeUInt32LE(offset, 10);
    centralParts.push(Buffer.concat([uint32(CENTRAL_HEADER_SIGNATURE), uint16(ZIP_VERSION), header, centralFields, name]));
    localParts.push(local);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

// The fields that the local header and the central directory header share, in the same order.
function sharedHeader(method: number, crc: number, storedSize: number, size: number, nameLength: number): Buffer {
  const header = Buffer.alloc(26);
  header.writeUInt16LE(ZIP_VERSION, 0);
  header.writeUInt16LE(method, 4);
  header.writeUInt16LE(DOS_TIME_MIDNIGHT, 6);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 8);
  header.writeUInt32LE(crc, 10);
  header.writeUInt32LE(storedSize, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt16LE(nameLength, 22);
  return header;
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}
