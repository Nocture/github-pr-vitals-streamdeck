import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import type { KeyAction, KeyUpEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import { KeyPainter } from "../face/key-painter";
import type { TokenFace } from "../face/other-faces";
import { renderSummaryLoading, renderSummaryStale, renderSummaryToken, type StaleNotice, SUMMARY_NAMES } from "../face/summary/connection";
import { isSummaryAnimated, renderSummary, type SummaryData, type SummaryStyle, summaryStyleOf } from "../face/summary/index";
import { keyImage } from "../face/svg";
import type { PullRequest } from "../github/types";
import { warnOnFailure } from "../log";
import type { PollIssue } from "../poller";
import type { PrStatus, StatusView } from "../pr-status";
import { bundledProfileOf, type ListKind, SUMMARY_ACTION_UUIDS } from "../profiles";
import { answerPropertyInspector, type PropertyInspectorRequest } from "../property-inspector";
import { formatClock, noticeOf } from "../prs/notices";
import { summarizeDeploy, summarizeMine } from "../prs/summary";
import type { KeySettings } from "../settings";
import { tokenPageOf } from "./slot-action";

// A face with a notice is stale: the key shows it dimmed, with the notice below.
type SummaryFace =
  | { kind: "token"; face: TokenFace }
  | { kind: "loading"; notice: StaleNotice | null }
  | { kind: "summary"; data: SummaryData; notice: StaleNotice | null };

/**
 * A key that counts the pull requests of one list. Every key of the action shows the same face.
 * A press switches the deck to the bundled profile of the list.
 */
abstract class SummaryAction extends SingletonAction<KeySettings> implements StatusView {
  protected abstract readonly list: ListKind;
  private readonly painter = new KeyPainter();

  constructor(private readonly status: PrStatus) {
    super();
    status.addView(this);
  }

  override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
    this.painter.forget(ev.action.id);
    this.status.keysChanged();
  }

  override onWillDisappear(): void {
    this.status.keysChanged();
  }

  override async onKeyUp(ev: KeyUpEvent<KeySettings>): Promise<void> {
    const face = this.face();
    if (face.kind === "token") {
      await warnOnFailure(streamDeck.system.openUrl(tokenPageOf(face.face)), "Opening the link");
      return;
    }
    const { device } = ev.action;
    const profile = bundledProfileOf(this.list, device.type);
    if (profile === null) {
      streamDeck.logger.info(`No bundled profile for device type ${device.type}`);
      return;
    }
    await warnOnFailure(streamDeck.profiles.switchToProfile(device.id, profile), "Switching the profile");
  }

  override async onSendToPlugin(ev: SendToPluginEvent<PropertyInspectorRequest, KeySettings>): Promise<void> {
    await warnOnFailure(answerPropertyInspector(ev.payload, this.status), "Answering the settings page");
  }

  hasVisibleKeys(): boolean {
    return this.keys().length > 0;
  }

  isAnimating(): boolean {
    if (!this.hasVisibleKeys()) return false;
    const face = this.face();
    switch (face.kind) {
      case "token":
        return false;
      case "loading":
        return face.notice === null;
      case "summary":
        return face.notice === null && isSummaryAnimated(face.data);
    }
  }

  async redraw(): Promise<void> {
    const keys = this.keys();
    if (keys.length === 0) return;
    const image = keyImage(this.render(this.face()));
    for (const key of keys) await warnOnFailure(this.painter.paint(key, image), `Painting key ${key.id}`);
  }

  private get name(): string {
    return SUMMARY_NAMES[this.list];
  }

  private render(face: SummaryFace): string {
    switch (face.kind) {
      case "token":
        return renderSummaryToken(this.name, face.face);
      case "loading":
        return this.drawn((frame) => renderSummaryLoading(this.name, frame), face.notice);
      case "summary": {
        const style = this.style();
        return this.drawn((frame) => renderSummary(face.data, style, frame), face.notice);
      }
    }
  }

  // A stale face is drawn at frame 0, so that it stays still.
  private drawn(draw: (frame: number) => string, notice: StaleNotice | null): string {
    return notice === null ? draw(this.status.frame) : renderSummaryStale(draw(0), this.name, notice);
  }

  private face(): SummaryFace {
    const { snapshot } = this.status;
    switch (snapshot.kind) {
      case "noToken":
        return { kind: "token", face: "missing" };
      case "tokenProblem":
        return { kind: "token", face: snapshot.problem };
      case "waiting":
        return { kind: "loading", notice: staleNoticeOf(snapshot.issue, null) };
      case "ready":
        return { kind: "summary", data: this.summaryOf(snapshot.prs), notice: staleNoticeOf(snapshot.issue, snapshot.updatedMs) };
    }
  }

  private summaryOf(myPrs: PullRequest[]): SummaryData {
    return this.list === "mine"
      ? { kind: "mine", summary: summarizeMine(myPrs) }
      : { kind: "deploy", summary: summarizeDeploy(this.status.deployPrs()) };
  }

  private style(): SummaryStyle {
    const { mineStyle, deployStyle } = this.status.settings;
    return summaryStyleOf(this.list === "mine" ? mineStyle : deployStyle, this.list);
  }

  private keys(): KeyAction<KeySettings>[] {
    const keys: KeyAction<KeySettings>[] = [];
    for (const instance of this.actions) {
      if (instance.isKey()) keys.push(instance);
    }
    return keys;
  }
}

function staleNoticeOf(issue: PollIssue | null, updatedMs: number | null): StaleNotice | null {
  if (issue?.kind === "rateLimited") return { kind: "paused", untilText: `until ${formatClock(issue.untilMs)}` };
  const text = noticeOf(issue, updatedMs, Date.now());
  return text === null ? null : { kind: "offline", text };
}

@action({ UUID: SUMMARY_ACTION_UUIDS.mine })
export class SummaryMineAction extends SummaryAction {
  protected readonly list = "mine";
}

@action({ UUID: SUMMARY_ACTION_UUIDS.deploy })
export class SummaryDeployAction extends SummaryAction {
  protected readonly list = "deploy";
}
