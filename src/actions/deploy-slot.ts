import { action } from "@elgato/streamdeck";
import { SLOT_ACTION_UUIDS } from "../profiles";
import { SlotAction } from "./slot-action";

@action({ UUID: SLOT_ACTION_UUIDS.deploy })
export class DeploySlotAction extends SlotAction {
  protected readonly list = "deploy";
}
