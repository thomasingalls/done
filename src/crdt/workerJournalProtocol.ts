/** Data-only Window/worker journal protocol; snapshots confer no verification authority. */
export const RAW_JOURNAL_PAGE_CHARACTERS = 32 * 1024;
export const RAW_JOURNAL_REMOVE_ITEMS = 16;
export interface RawJournalSnapshot {
  readonly entries: readonly (readonly [string, string])[];
  readonly characters: number;
}
export interface RawJournalPage extends RawJournalSnapshot {
  readonly done: boolean;
}
export interface RawJournalRemoval {
  readonly removed: number;
  readonly changed: number;
  readonly retained: number;
}
