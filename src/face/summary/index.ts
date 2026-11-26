import type { ListKind } from "../../profiles";
import type { DeploySummary, MySummary } from "../../prs/summary";
import { keySvg } from "../svg";
import { ledgerDeploy, ledgerMine } from "./ledger";
import { scoreboardDeploy, scoreboardMine } from "./scoreboard";
import { signalDeploy, signalMine } from "./signal";

export type SummaryStyle = "scoreboard" | "signal" | "ledger";
export const DEFAULT_SUMMARY_STYLES: Record<ListKind, SummaryStyle> = { mine: "scoreboard", deploy: "signal" };
export type SummaryData = { kind: "mine"; summary: MySummary } | { kind: "deploy"; summary: DeploySummary };

const SUMMARY_STYLES: SummaryStyle[] = ["scoreboard", "signal", "ledger"];

export function summaryStyleOf(value: unknown, list: ListKind): SummaryStyle {
  return SUMMARY_STYLES.find((style) => style === value) ?? DEFAULT_SUMMARY_STYLES[list];
}

const FACES = {
  scoreboard: { mine: scoreboardMine, deploy: scoreboardDeploy },
  signal: { mine: signalMine, deploy: signalDeploy },
  ledger: { mine: ledgerMine, deploy: ledgerDeploy },
};

export function renderSummary(data: SummaryData, style: SummaryStyle, frame: number): string {
  return keySvg(data.kind === "mine" ? FACES[style].mine(data.summary, frame) : FACES[style].deploy(data.summary, frame));
}

export function isSummaryAnimated(data: SummaryData): boolean {
  const { summary } = data;
  if (summary.failing > 0 || summary.running > 0) return true;
  return data.kind === "deploy" && (data.summary.pipeline === "failing" || data.summary.pipeline === "running");
}
