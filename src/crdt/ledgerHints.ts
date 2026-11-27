/** Scheduling hints only. Never a verification result, retention proof or effect permission. */
import type { LocalRetentionHint } from './automaticLocalRetention';

const key = (hint: LocalRetentionHint | undefined) =>
  hint ? `${hint.revision}:${hint.records}${hint.fold ? ':fold' : ''}` : '';

/**
 * Owner-side hints derived from the last adopted ledger view.
 * - The retention hint is withdrawn while a validation runs and restored when it adopts a view.
 * - `fullCheck` says the adopted incremental view has no continuation indexes, so the next ledger
 *   change pays the full reference check. It stays stable while that check runs.
 * Observers are told (once per microtask) when either may have changed in a way they could have
 * missed; they re-read and re-check eligibility themselves.
 */
export function createLedgerHints() {
  let hint: LocalRetentionHint | undefined;
  let fullCheck = false;
  let entry: { key: string; fullCheck: boolean } | undefined;
  let missed = false,
    queued = false,
    closed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (queued || closed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (closed) return;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          /* observer owns its failure */
        }
      }
    });
  };
  return Object.freeze({
    /** Validation entry: the previous hint is stale until this validation adopts its view. */
    begin() {
      entry ??= { key: key(hint), fullCheck };
      hint = undefined;
    },
    /** Authority or lifecycle change outside validation. */
    withdraw() {
      hint = undefined;
    },
    /**
     * Validation threw: keep the hint withdrawn; the next adopted view restores it. `full` is
     * given only when the view was adopted before a later discretionary step yielded.
     */
    abandon(full?: boolean) {
      entry = undefined;
      if (full === undefined || full === fullCheck) return;
      fullCheck = full;
      notify();
    },
    /**
     * A validation adopted its view. `full` is undefined when no ledger check ran (the retained
     * view was byte-equal), so the previous continuation observation still describes it.
     */
    settle(next: LocalRetentionHint | undefined, full: boolean | undefined) {
      const before = entry ?? { key: key(hint), fullCheck };
      entry = undefined;
      hint = next;
      if (full !== undefined) fullCheck = full;
      if (missed || key(hint) !== before.key || fullCheck !== before.fullCheck) {
        missed = false;
        notify();
      }
    },
    hint(): LocalRetentionHint | undefined {
      // Only a read during the validation gap can leave a scheduler idle with no later event.
      if (!hint && entry) missed = true;
      return hint;
    },
    fullCheck: () => fullCheck,
    subscribe(listener: () => void) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      closed = true;
      hint = undefined;
      fullCheck = false;
      entry = undefined;
      listeners.clear();
    },
  });
}
