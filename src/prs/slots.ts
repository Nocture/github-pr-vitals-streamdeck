import type { PullRequest } from "../github/types";
import { compareCodeUnits } from "./derive";

export type SlotKey = { id: string; deviceId: string; row: number; column: number };

export type SlotContent = { kind: "pr"; pr: PullRequest } | { kind: "overflow"; count: number } | { kind: "empty" };

export const MORE_PRS_URL = "https://github.com/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+sort%3Acreated-desc";
export const APPROVED_PRS_URL = "https://github.com/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+review%3Aapproved";

export function orderSlotKeys<Key extends SlotKey>(keys: Key[]): Key[] {
  return [...keys].sort(
    (first, second) =>
      compareCodeUnits(first.deviceId, second.deviceId) || first.row - second.row || first.column - second.column,
  );
}

// totalCount can be larger than prs.length: GitHub returns at most 100 pull requests.
export function slotContents(prs: PullRequest[], slotCount: number, totalCount: number): SlotContent[] {
  if (slotCount <= 0) return [];
  const hasOverflow = totalCount > slotCount;
  const shownCount = hasOverflow ? slotCount - 1 : slotCount;
  const contents: SlotContent[] = Array.from({ length: shownCount }, (_, index) =>
    index < prs.length ? { kind: "pr", pr: prs[index] } : { kind: "empty" },
  );
  if (hasOverflow) contents.push({ kind: "overflow", count: totalCount - shownCount });
  return contents;
}
