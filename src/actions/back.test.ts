import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { KeyUpEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import { BUILD_LABEL } from "../build";
import { SVG_DATA_PREFIX } from "../face/svg";
import { POLL_INTERVAL_MS } from "../poller";
import { APPEAR_SETTLE_MS, PrStatus } from "../pr-status";
import type { ListKind } from "../profiles";
import type { PropertyInspectorRequest } from "../property-inspector";
import type { KeySettings } from "../settings";
import { createKey, type FakeKey, stage, streamDeckMock, svgTexts } from "../test-support";
import { BackAction } from "./back";
import { DeploySlotAction } from "./deploy-slot";
import { PrSlotAction } from "./pr-slot";
import type { SlotAction } from "./slot-action";

vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock);

const { switchToProfile } = streamDeckMock.default.profiles;
const { sendToPropertyInspector } = streamDeckMock.default.ui;

const BACK_ID = "com.nocture.prvitals.back";
const SLOT_IDS: Record<ListKind, string> = {
  mine: "com.nocture.prvitals.pr-slot",
  deploy: "com.nocture.prvitals.deploy-slot",
};

let fetchSpy: ReturnType<typeof vi.fn>;
let back: BackAction;
let slots: Record<ListKind, SlotAction>;

// Resolves when the plugin has read the global settings.
function startPlugin(): Promise<void> {
  const status = new PrStatus();
  slots = { mine: new PrSlotAction(status), deploy: new DeploySlotAction(status) };
  back = new BackAction(status, slots);
  return status.start();
}

function appearBack(deviceId: string): FakeKey {
  const key = createKey({ deviceId, row: 0, column: 0 }, `back-${deviceId}`, { manifestId: BACK_ID });
  stage.keys = [...stage.keys, key];
  void back.onWillAppear({ action: key } as unknown as WillAppearEvent<KeySettings>);
  return key;
}

function appearSlot(list: ListKind, deviceId: string): void {
  const key = createKey({ deviceId, row: 1, column: 0 }, `${list}-${deviceId}`, { manifestId: SLOT_IDS[list] });
  stage.keys = [...stage.keys, key];
  void slots[list].onWillAppear({ action: key } as unknown as WillAppearEvent<KeySettings>);
}

function shown(key: FakeKey): string[] {
  const image = key.setImage.mock.lastCall?.[0] ?? "";
  return svgTexts(decodeURIComponent(image.slice(SVG_DATA_PREFIX.length)));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stage.keys = [];
  stage.globalSettings = { githubToken: "ghp_test" };
  fetchSpy = vi.fn(async () => new Response(null, { status: 500 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a press returns to the previous profile", async () => {
  await startPlugin();
  const key = appearBack("deck-1");
  await back.onKeyUp({ action: key } as unknown as KeyUpEvent<KeySettings>);
  expect(switchToProfile.mock.calls).toEqual([["deck-1"]]);
});

test("names the list of the slot keys on its deck", async () => {
  await startPlugin();
  const onBothLists = appearBack("deck-1");
  appearSlot("mine", "deck-1");
  appearSlot("deploy", "deck-1");
  const onMyPrs = appearBack("deck-2");
  appearSlot("mine", "deck-2");
  const alone = appearBack("deck-3");
  await vi.advanceTimersByTimeAsync(APPEAR_SETTLE_MS);
  expect(shown(onBothLists)).toEqual(["Back", "deploy"]);
  expect(shown(onMyPrs)).toEqual(["Back", "my PRs"]);
  expect(shown(alone)).toEqual(["Back"]);
});

test("a Back key alone does not call GitHub", async () => {
  await startPlugin();
  appearBack("deck-1");
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("answers the settings page", async () => {
  await startPlugin();
  const request: PropertyInspectorRequest = { event: "getBuild" };
  await back.onSendToPlugin({ payload: request } as unknown as SendToPluginEvent<PropertyInspectorRequest, KeySettings>);
  expect(sendToPropertyInspector).toHaveBeenCalledExactlyOnceWith({ event: "build", label: BUILD_LABEL });
});
