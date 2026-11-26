import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import type { KeyAction, KeyUpEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { KeyPainter } from "../face/key-painter";
import {
  renderEmptySlot,
  type JiraWindowKind,
  renderJiraWindow,
  renderNoData,
  renderNothingApproved,
  renderOverflow,
  renderTokenFace,
  type TokenFace,
} from "../face/other-faces";
import { isAnimated, renderPrKey } from "../face/pr-face";
import { keyImage } from "../face/svg";
import { SSO_PAGE_URL, TOKEN_PAGE_URL } from "../github/token-pages";
import type { PullRequest } from "../github/types";
import { REDRAW_LABEL, warnOnFailure } from "../log";
import type { PrStatus, StatusView } from "../pr-status";
import type { ListKind } from "../profiles";
import { answerPropertyInspector, type PropertyInspectorRequest } from "../property-inspector";
import { noticeOf } from "../prs/notices";
import { APPROVED_PRS_URL, MORE_PRS_URL, orderSlotKeys, type SlotContent, type SlotKey, slotContents } from "../prs/slots";
import { jiraBrowseUrl, type KeySettings } from "../settings";

export const JIRA_WINDOW_MS = 3_000;
const SECOND_MS = 1_000;

export function tokenPageOf(face: TokenFace): string {
  return face === "sso" ? SSO_PAGE_URL : TOKEN_PAGE_URL;
}

type SlotFace =
  | SlotContent
  | { kind: "nothingApproved" }
  | { kind: "token"; face: TokenFace }
  | { kind: "noData"; notice: string };
type Slot = { key: KeyAction<KeySettings>; face: SlotFace };
type JiraWindow = { pr: PullRequest; secondsLeft: number; ticker: ReturnType<typeof setInterval> };

const EMPTY: SlotFace = { kind: "empty" };
const NOTHING_APPROVED: SlotFace = { kind: "nothingApproved" };
const OVERFLOW_URLS: Record<ListKind, string> = { mine: MORE_PRS_URL, deploy: APPROVED_PRS_URL };

/**
 * A key that fills itself with one pull request of a list. The slot keys of an action show the list in key order.
 * A press opens the pull request and opens the Jira window of the key: for JIRA_WINDOW_MS the key counts down,
 * and a second press opens the Jira ticket of that pull request.
 */
export abstract class SlotAction extends SingletonAction<KeySettings> implements StatusView {
  protected abstract readonly list: ListKind;
  private readonly painter = new KeyPainter();
  private readonly jiraWindows = new Map<string, JiraWindow>();

  constructor(private readonly status: PrStatus) {
    super();
    status.addView(this);
  }

  override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
    this.painter.forget(ev.action.id);
    this.status.keysChanged();
  }

  override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
    this.closeJiraWindow(ev.action.id);
    this.status.keysChanged();
  }

  override async onKeyUp(ev: KeyUpEvent<KeySettings>): Promise<void> {
    const url = this.press(ev.action.id);
    if (url !== null) await warnOnFailure(streamDeck.system.openUrl(url), "Opening the link");
    await warnOnFailure(this.redraw(), REDRAW_LABEL);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<PropertyInspectorRequest, KeySettings>): Promise<void> {
    await warnOnFailure(answerPropertyInspector(ev.payload, this.status), "Answering the settings page");
  }

  hasVisibleKeys(): boolean {
    return this.slotKeys().length > 0;
  }

  hasKeysOn(deviceId: string): boolean {
    return this.slotKeys().some((key) => key.device.id === deviceId);
  }

  isAnimating(): boolean {
    return this.slots().some(({ face }) => face.kind === "pr" && isAnimated(this.status.viewOf(face.pr)));
  }

  // A key in its Jira window keeps its Jira face.
  async redraw(): Promise<void> {
    for (const { key, face } of this.slots()) {
      const jiraWindow = this.jiraWindows.get(key.id);
      const svg = jiraWindow === undefined ? this.render(face) : this.renderJiraWindowOf(jiraWindow);
      await warnOnFailure(this.painter.paint(key, keyImage(svg)), `Painting key ${key.id}`);
    }
  }

  // Returns the link that the press opens. A press in the Jira window closes it. A press on a pull request opens one.
  private press(keyId: string): string | null {
    const jiraWindow = this.jiraWindows.get(keyId);
    if (jiraWindow !== undefined) {
      this.closeJiraWindow(keyId);
      return this.jiraUrlOf(jiraWindow.pr);
    }
    const face = this.faceOf(keyId);
    if (face === undefined) return null;
    if (face.kind === "pr") this.openJiraWindow(keyId, face.pr);
    return this.urlOf(face);
  }

  private openJiraWindow(keyId: string, pr: PullRequest): void {
    const jiraWindow: JiraWindow = {
      pr,
      secondsLeft: JIRA_WINDOW_MS / SECOND_MS,
      ticker: setInterval(() => {
        jiraWindow.secondsLeft -= 1;
        if (jiraWindow.secondsLeft === 0) this.closeJiraWindow(keyId);
        void warnOnFailure(this.redraw(), REDRAW_LABEL);
      }, SECOND_MS),
    };
    this.jiraWindows.set(keyId, jiraWindow);
  }

  private closeJiraWindow(keyId: string): void {
    clearInterval(this.jiraWindows.get(keyId)?.ticker);
    this.jiraWindows.delete(keyId);
  }

  private urlOf(face: SlotFace): string | null {
    switch (face.kind) {
      case "pr":
        return face.pr.url;
      case "overflow":
        return OVERFLOW_URLS[this.list];
      case "nothingApproved":
        return APPROVED_PRS_URL;
      case "token":
        return tokenPageOf(face.face);
      case "noData":
      case "empty":
        return null;
    }
  }

  private renderJiraWindowOf({ pr, secondsLeft }: JiraWindow): string {
    return renderJiraWindow(this.jiraWindowKindOf(pr), secondsLeft);
  }

  private jiraWindowKindOf(pr: PullRequest): JiraWindowKind {
    if (this.status.ticketOf(pr) === null) return "noTicket";
    return this.jiraUrlOf(pr) === null ? "noSite" : "ticket";
  }

  private jiraUrlOf(pr: PullRequest): string | null {
    const ticket = this.status.ticketOf(pr);
    return ticket === null ? null : jiraBrowseUrl(this.status.settings.jiraSite, ticket);
  }

  private render(face: SlotFace): string {
    switch (face.kind) {
      case "pr":
        return renderPrKey(this.status.viewOf(face.pr), this.status.frame);
      case "overflow":
        return renderOverflow(face.count);
      case "nothingApproved":
        return renderNothingApproved();
      case "token":
        return renderTokenFace(face.face);
      case "noData":
        return renderNoData(face.notice);
      case "empty":
        return renderEmptySlot();
    }
  }

  private faceOf(keyId: string): SlotFace | undefined {
    return this.slots().find(({ key }) => key.id === keyId)?.face;
  }

  private slots(): Slot[] {
    const keys = this.slotKeys();
    const faces = this.facesFor(keys.length);
    return keys.map((key, index) => ({ key, face: faces[index] }));
  }

  // A key in a multi-action has no coordinates. It takes no slot and shifts no other key.
  private slotKeys(): KeyAction<KeySettings>[] {
    const keys: (SlotKey & { key: KeyAction<KeySettings> })[] = [];
    for (const instance of this.actions) {
      if (!instance.isKey() || instance.coordinates === undefined) continue;
      const { row, column } = instance.coordinates;
      keys.push({ id: instance.id, deviceId: instance.device.id, row, column, key: instance });
    }
    return orderSlotKeys(keys).map(({ key }) => key);
  }

  private facesFor(slotCount: number): SlotFace[] {
    const snapshot = this.status.snapshot;
    switch (snapshot.kind) {
      case "ready":
        if (this.list === "mine") return slotContents(snapshot.prs, slotCount, snapshot.totalCount);
        return this.deployFaces(slotCount, noticeOf(snapshot.issue, snapshot.updatedMs, Date.now()));
      case "noToken":
        return firstSlotFaces(slotCount, { kind: "token", face: "missing" });
      case "tokenProblem":
        return firstSlotFaces(slotCount, { kind: "token", face: snapshot.problem });
      case "waiting": {
        const notice = noticeOf(snapshot.issue, null, Date.now());
        return firstSlotFaces(slotCount, notice === null ? EMPTY : { kind: "noData", notice });
      }
    }
  }

  // With a notice, the data is old, so an empty list does not prove that nothing is approved.
  private deployFaces(slotCount: number, notice: string | null): SlotFace[] {
    const prs = this.status.deployPrs();
    if (prs.length > 0) return slotContents(prs, slotCount, prs.length);
    return firstSlotFaces(slotCount, notice === null ? NOTHING_APPROVED : { kind: "noData", notice });
  }
}

// The first slot shows the face. The other slots are empty.
function firstSlotFaces(slotCount: number, face: SlotFace): SlotFace[] {
  return Array.from({ length: slotCount }, (_, index) => (index === 0 ? face : EMPTY));
}
