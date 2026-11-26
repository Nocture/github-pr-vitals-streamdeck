import { action } from "@elgato/streamdeck";
import { SLOT_ACTION_UUIDS } from "../profiles";
import { SlotAction } from "./slot-action";

@action({ UUID: SLOT_ACTION_UUIDS.mine })
export class PrSlotAction extends SlotAction {
  protected readonly list = "mine";
}
