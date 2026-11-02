import { publicationState, type DeliveryState } from './deliveryRecord';
import { RECEIVE_POLL_MS } from './accountReceiveDriver';
import type { InboundReadCursor } from './inboundLedger';
import { RECEIVE_GROUP_LIMIT } from './receiveGroup';
import { READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';

/** A network width cannot multiply the caller's existing verified-position allowance. */
export function receiveReadWidths(positions: number, width: number): readonly number[] {
  if (
    !Number.isSafeInteger(positions) ||
    positions < 1 ||
    positions > RECEIVE_GROUP_LIMIT ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    width > READ_COUNT_LIMIT
  )
    throw Error('Invalid receive range plan');
  const result: number[] = [];
  for (let remaining = positions; remaining > 0;) {
    const count = Math.min(remaining, width);
    result.push(count);
    remaining -= count;
  }
  return Object.freeze(result);
}

/** Called only on verified delivery state; allocation alone is not evidence of a sent request. */
export function unresolvedSelfSubmission(s: Readonly<DeliveryState>): boolean {
  // Old refusal responses survive a current-key retry. Only the verified current state
  // decides whether its retained submission is unresolved, not the presence of old replies.
  return publicationState(s) === 'ready' && s.submissions.has(s.acceptedThrough + 1);
}

/** Scheduling hint from the current verified projection, restricted to eligible peer streams. */
export function hasPeerBacklog(
  publishers: readonly string[],
  own: string,
  peers: InboundReadCursor['peers'],
): boolean {
  return publishers.some((id) => {
    const peer = id === own ? undefined : peers?.get(id);
    return !!peer && !peer.conflict && peer.prefix.observedThrough > peer.prefix.position;
  });
}

export const RECEIVE_QUIET_MS = 750;
const MAX_QUIET_PUBLISHERS = 128;
type QuietBasis = {
  context: object;
  publisher: string;
  position: number;
  link: string;
  observedThrough: number;
  startingPosition: number | undefined;
  startingLink: string | undefined;
};
const quietCursor = (cursor: InboundReadCursor) =>
  !cursor.conflict &&
  Number.isSafeInteger(cursor.prefix.position) &&
  cursor.prefix.position >= 0 &&
  cursor.prefix.observedThrough === cursor.prefix.position;
const sameQuietCursor = (held: QuietBasis, cursor: InboundReadCursor) =>
  quietCursor(cursor) &&
  held.position === cursor.prefix.position &&
  held.link === cursor.prefix.link &&
  held.observedThrough === cursor.prefix.observedThrough &&
  held.startingPosition === cursor.startingPoint?.position &&
  held.startingLink === cursor.startingPoint?.link;

/** Scheduling only. A selected publisher and every returned page still require fresh authority. */
export function createReceiveSelection(now: () => number = Date.now, quietBudget = false) {
  const quiet = new Map<string, QuietBasis & { at: number }>();
  // Opaque single-use tokens. Replacing the map fences pre-hint completions without aborting I/O.
  let attempts = new WeakMap<object, QuietBasis>();
  let lastQuietClock: number | undefined;
  const invalidateQuiet = () => {
    quiet.clear();
    attempts = new WeakMap();
  };
  const observeClock = (at: number) => {
    if (!Number.isFinite(at) || (lastQuietClock !== undefined && at < lastQuietClock))
      invalidateQuiet();
    lastQuietClock = Number.isFinite(at) ? at : undefined;
  };
  let next = 0;
  let streak = 0;
  let previous: string | undefined;
  let productive = false;
  let checkedOwn: { publisher: string; at: number } | undefined;
  return {
    invalidateQuiet,
    captureQuiet(context: object, publisher: string, cursor: InboundReadCursor) {
      if (!quietBudget || !quietCursor(cursor)) return undefined;
      const at = now();
      observeClock(at);
      if (!Number.isFinite(at)) return undefined;
      const token = {};
      attempts.set(token, {
        context,
        publisher,
        position: cursor.prefix.position,
        link: cursor.prefix.link,
        observedThrough: cursor.prefix.observedThrough,
        startingPosition: cursor.startingPoint?.position,
        startingLink: cursor.startingPoint?.link,
      });
      return token;
    },
    completedQuiet(token: object | undefined, kind: string) {
      if (!quietBudget || !token) return false;
      const at = now();
      observeClock(at);
      const held = attempts.get(token);
      attempts.delete(token);
      if (!held) return false;
      quiet.delete(held.publisher);
      if (kind !== 'empty' || !Number.isFinite(at)) return false;
      if (quiet.size >= MAX_QUIET_PUBLISHERS) quiet.delete(quiet.keys().next().value!);
      quiet.set(held.publisher, { ...held, at });
      return true;
    },
    reset() {
      invalidateQuiet();
      lastQuietClock = undefined;
      next = 0;
      streak = 0;
      previous = undefined;
      productive = false;
      checkedOwn = undefined;
    },
    capacity(publisher: string) {
      return previous === publisher ? RECEIVE_GROUP_LIMIT - streak : RECEIVE_GROUP_LIMIT;
    },
    next(
      publishers: readonly string[],
      own?: { publisher: string; pending: boolean; peerBacklog?: boolean },
      view?: {
        context: object;
        peers: ReadonlyMap<string, InboundReadCursor> | undefined;
        cursor?: (publisher: string) => InboundReadCursor | undefined;
      },
    ) {
      if (!publishers.length) throw Error('No eligible receive publisher');
      const at = now();
      if (quietBudget) observeClock(at);
      // Keep the existing idle-poll interval, including after a clock rollback. An
      // unresolved submission or authority reset must never be hidden by an empty self check.
      const skipOwn =
        publishers.length > 1 &&
        own &&
        !own.pending &&
        (previous === own.publisher || productive || own.peerBacklog === true) &&
        checkedOwn?.publisher === own.publisher &&
        at >= checkedOwn.at &&
        at - checkedOwn.at < RECEIVE_POLL_MS;
      const pick = () => {
        let publisher = publishers[next++ % publishers.length]!;
        if (skipOwn && publisher === own.publisher)
          publisher = publishers[next++ % publishers.length]!;
        return publisher;
      };
      let publisher = pick();
      if (quietBudget && own?.peerBacklog === true && view) {
        for (let checked = 0; checked < publishers.length; checked++) {
          const held = quiet.get(publisher);
          if (
            publisher === own.publisher ||
            !held ||
            held.context !== view.context ||
            at < held.at ||
            at - held.at >= RECEIVE_QUIET_MS
          )
            break;
          const cursor = view.peers?.get(publisher) ?? view.cursor?.(publisher);
          if (!cursor || !sameQuietCursor(held, cursor)) break;
          publisher = pick();
        }
      }
      return publisher;
    },
    completed(
      publishers: readonly string[],
      publisher: string,
      progress: boolean,
      verifiedOwn = false,
      positions = 1,
    ) {
      const index = publishers.indexOf(publisher);
      if (index < 0) return;
      if (
        !Number.isSafeInteger(positions) ||
        positions < 0 ||
        positions > RECEIVE_GROUP_LIMIT ||
        (progress &&
          (positions < 1 ||
            positions >
              (previous === publisher ? RECEIVE_GROUP_LIMIT - streak : RECEIVE_GROUP_LIMIT)))
      )
        throw Error('Invalid receive position credit');
      if (quietBudget && progress) quiet.delete(publisher);
      if (verifiedOwn) checkedOwn = { publisher, at: now() };
      streak = progress ? (previous === publisher ? streak + positions : positions) : 0;
      previous = publisher;
      productive = progress;
      // Four verified positions, then let other publishers reconcile. Network pages and ranges
      // consume the same allowance; input and due sending still get their existing group yield.
      if (progress && streak < RECEIVE_GROUP_LIMIT) next = index;
      else {
        next = index + 1;
        streak = 0;
      }
    },
  };
}
