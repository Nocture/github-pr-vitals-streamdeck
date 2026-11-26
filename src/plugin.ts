import streamDeck from "@elgato/streamdeck";
import { BackAction } from "./actions/back";
import { DeploySlotAction } from "./actions/deploy-slot";
import { PrSlotAction } from "./actions/pr-slot";
import { SummaryDeployAction, SummaryMineAction } from "./actions/summary";
import { BUILD_LABEL } from "./build";
import { warnOnFailure } from "./log";
import { PrStatus } from "./pr-status";

streamDeck.logger.setLevel("info");
streamDeck.logger.info("PR Vitals plugin build " + BUILD_LABEL);

const status = new PrStatus();
const slots = { mine: new PrSlotAction(status), deploy: new DeploySlotAction(status) };
streamDeck.actions.registerAction(slots.mine);
streamDeck.actions.registerAction(slots.deploy);
streamDeck.actions.registerAction(new SummaryMineAction(status));
streamDeck.actions.registerAction(new SummaryDeployAction(status));
streamDeck.actions.registerAction(new BackAction(status, slots));
void warnOnFailure(status.start(), "PR Vitals start");

void warnOnFailure(streamDeck.connect(), "Stream Deck connect");
