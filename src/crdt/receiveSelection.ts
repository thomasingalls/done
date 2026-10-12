import { publicationState, type DeliveryState } from './deliveryRecord';
import { RECEIVE_POLL_MS } from './accountReceiveDriver';

/** Called only on verified delivery state; allocation alone is not evidence of a sent request. */
export function unresolvedSelfSubmission(s: Readonly<DeliveryState>): boolean {
  // Old refusal responses survive a current-key retry. Only the verified current state
  // decides whether its retained submission is unresolved, not the presence of old replies.
  return publicationState(s) === 'ready' && s.submissions.has(s.acceptedThrough + 1);
}

/** Scheduling only. A selected publisher and every returned page still require fresh authority. */
export function createReceiveSelection(now: () => number = Date.now) {
  let next = 0;
  let streak = 0;
  let previous: string | undefined;
  let productive = false;
  let checkedOwn: { publisher: string; at: number } | undefined;
  return {
    reset() {
      next = 0;
      streak = 0;
      previous = undefined;
      productive = false;
      checkedOwn = undefined;
    },
    next(publishers: readonly string[], own?: { publisher: string; pending: boolean }) {
      if (!publishers.length) throw Error('No eligible receive publisher');
      const at = now();
      // Keep the existing idle-poll interval, including after a clock rollback. An
      // unresolved submission or authority reset must never be hidden by an empty self check.
      const skipOwn =
        publishers.length > 1 &&
        own &&
        !own.pending &&
        (previous === own.publisher || productive) &&
        checkedOwn?.publisher === own.publisher &&
        at >= checkedOwn.at &&
        at - checkedOwn.at < RECEIVE_POLL_MS;
      let publisher = publishers[next++ % publishers.length]!;
      if (skipOwn && publisher === own.publisher)
        publisher = publishers[next++ % publishers.length]!;
      return publisher;
    },
    completed(
      publishers: readonly string[],
      publisher: string,
      progress: boolean,
      verifiedOwn = false,
    ) {
      const index = publishers.indexOf(publisher);
      if (index < 0) return;
      if (verifiedOwn) checkedOwn = { publisher, at: now() };
      streak = progress ? (previous === publisher ? streak + 1 : 1) : 0;
      previous = publisher;
      productive = progress;
      // Four useful pages, then let other publishers reconcile. The outer scheduler
      // yields to the event loop and any due sender after EVERY page.
      if (progress && streak < 4) next = index;
      else {
        next = index + 1;
        streak = 0;
      }
    },
  };
}
