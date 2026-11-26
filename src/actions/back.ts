import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type { KeyUpEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import { KeyPainter } from "../face/key-painter";
import { renderBack } from "../face/other-faces";
import { keyImage } from "../face/svg";
import { warnOnFailure } from "../log";
import type { PrStatus, StatusView } from "../pr-status";
import { BACK_ACTION_UUID, type ListKind } from "../profiles";
import { answerPropertyInspector, type PropertyInspectorRequest } from "../property-inspector";
import type { KeySettings } from "../settings";
import type { SlotAction } from "./slot-action";

const LIST_LABELS: Record<ListKind, string> = { mine: "my PRs", deploy: "deploy" };
const LABEL_ORDER: ListKind[] = ["deploy", "mine"];

/**
 * A key that switches its deck back to the profile it came from.
 * It names the list of the slot keys on its deck.
 */
@action({ UUID: BACK_ACTION_UUID })
export class BackAction extends SingletonAction<KeySettings> implements StatusView {
  private readonly painter = new KeyPainter();

  constructor(
    private readonly status: PrStatus,
    private readonly slots: Record<ListKind, SlotAction>,
  ) {
    super();
    status.addView(this);
  }

  override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
    this.painter.forget(ev.action.id);
    this.status.keysChanged();
  }

  override async onKeyUp(ev: KeyUpEvent<KeySettings>): Promise<void> {
    await warnOnFailure(streamDeck.profiles.switchToProfile(ev.action.device.id), "Switching the profile");
  }

  override async onSendToPlugin(ev: SendToPluginEvent<PropertyInspectorRequest, KeySettings>): Promise<void> {
    await warnOnFailure(answerPropertyInspector(ev.payload, this.status), "Answering the settings page");
  }

  // A Back key needs no data, so it does not make the plugin poll GitHub.
  hasVisibleKeys(): boolean {
    return false;
  }

  isAnimating(): boolean {
    return false;
  }

  async redraw(): Promise<void> {
    for (const instance of this.actions) {
      if (!instance.isKey()) continue;
      const image = keyImage(renderBack(this.labelOf(instance.device.id)));
      await warnOnFailure(this.painter.paint(instance, image), `Painting key ${instance.id}`);
    }
  }

  private labelOf(deviceId: string): string | null {
    const list = LABEL_ORDER.find((kind) => this.slots[kind].hasKeysOn(deviceId));
    return list === undefined ? null : LIST_LABELS[list];
  }
}
