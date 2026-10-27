import { expect, it } from 'vitest';
import {
  createReceiveSelection,
  hasPeerBacklog,
  unresolvedSelfSubmission,
} from '../src/crdt/receiveSelection';
import type { InboundReadCursor } from '../src/crdt/inboundLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import { RECEIVE_POLL_MS } from '../src/crdt/accountReceiveDriver';

it('stays with useful pages but bounds peer starvation; empty self reads do not recur each page', () => {
  const s = createReceiveSelection(),
    publishers = ['self', 'peer', 'third'];
  const seen: string[] = [];
  for (let i = 0; i < 11; i++) {
    const id = s.next(publishers);
    seen.push(id);
    s.completed(publishers, id, id !== 'self');
  }
  expect(seen).toEqual([
    'self',
    'peer',
    'peer',
    'peer',
    'peer',
    'third',
    'third',
    'third',
    'third',
    'self',
    'peer',
  ]);
});
it('does not install a removed publisher from a late completion', () => {
  const s = createReceiveSelection();
  s.next(['old']);
  s.completed(['new'], 'old', true);
  expect(s.next(['new'])).toBe('new');
});

it('skips recently verified own polls while preserving every peer turn and the periodic check', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now),
    publishers = ['self', 'peer', 'third'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  const seen = [];
  for (let i = 0; i < 24; i++) {
    const selected = s.next(publishers, own);
    seen.push(selected);
    s.completed(publishers, selected, true);
  }
  expect(seen).toEqual(
    Array.from({ length: 3 }, () => [...Array(4).fill('peer'), ...Array(4).fill('third')]).flat(),
  );
  now += RECEIVE_POLL_MS;
  expect(s.next(publishers, own)).toBe('self');
});

it('unresolved submissions bypass own-poll suppression without starving another publisher', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) {
    expect(s.next(publishers, own)).toBe('peer');
    s.completed(publishers, 'peer', true);
  }
  own.pending = true;
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', true, true);
  own.pending = false;
  expect(s.next(publishers, own)).toBe('peer');
});

it('does not delay a lone publisher or a receive-only owner', () => {
  const s = createReceiveSelection(() => 1000);
  s.completed(['self'], 'self', false, true);
  expect(s.next(['self'], { publisher: 'self', pending: false })).toBe('self');
  expect(s.next(['self'])).toBe('self');
});

it('finishes an idle sweep instead of replacing the own turn with a duplicate empty peer read', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  expect(s.next(publishers, own)).toBe('peer');
  s.completed(publishers, 'peer', false);
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  expect(s.next(publishers, own)).toBe('peer');
});

it('does not suppress own polling after an unverified result, a reset, or a clock rollback', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  s.completed(publishers, 'self', false); // A failed or rejected attempt supplies no check.
  s.completed(publishers, 'peer', false);
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) s.completed(publishers, 'peer', true);
  expect(s.next(publishers, own)).toBe('peer');
  s.reset();
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) s.completed(publishers, 'peer', true);
  now--;
  expect(s.next(publishers, own)).toBe('self');
});

it('does not transfer a completed own check to a new credential', () => {
  const s = createReceiveSelection(() => 1000);
  s.completed(['old', 'peer'], 'old', false, true);
  for (let i = 0; i < 4; i++) s.completed(['new', 'peer'], 'peer', true);
  expect(s.next(['new', 'peer'], { publisher: 'new', pending: false })).toBe('new');
});

it('recognizes current unresolved submissions, including current-key retries with old refusals', () => {
  const state = emptyDelivery();
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.submissions.set(1, new Uint8Array([1]));
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.refusals.set(1, 'prior-refusal');
  state.responses.set(1, [new Uint8Array([2])]);
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.refusals.clear(); // A verified retry resets current refusal, retaining the old response.
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.acceptedThrough = 1;
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.submissions.set(2, new Uint8Array([3]));
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.finalThrough = 1;
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.finalThrough = null;
  state.conflict = true;
  expect(unresolvedSelfSubmission(state)).toBe(false);
});

it('caps a group by the remaining publisher turn, including a partial preceding group', () => {
  const s = createReceiveSelection(),
    publishers = ['a', 'b'];
  expect(s.next(publishers)).toBe('a');
  s.completed(publishers, 'a', true);
  expect(s.capacity('a')).toBe(3);
  for (let i = 0; i < 3; i++) s.completed(publishers, 'a', true);
  expect(s.next(publishers)).toBe('b');
  expect(s.capacity('b')).toBe(4);
});

it('uses fresh peer backlog to retain a verified self check across intervening empty peers', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['quiet-a', 'quiet-b', 'self', 'quiet-c', 'busy'],
    own = { publisher: 'self', pending: false, peerBacklog: true };
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    const id = s.next(publishers, own);
    seen.push(id);
    s.completed(publishers, id, id === 'busy', id === 'self');
  }
  expect(seen.filter((id) => id === 'self')).toEqual(['self']);
  expect(seen.filter((id) => id !== 'self').slice(0, 18)).toEqual([
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
    'busy',
    'busy',
    'busy',
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
    'busy',
    'busy',
    'busy',
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
  ]);
});

it('preserves every non-self publisher turn for all three-to-six-publisher orders', () => {
  const permutations = (values: string[]): string[][] =>
    values.length < 2
      ? [values]
      : values.flatMap((v, i) =>
          permutations(values.filter((_, j) => j !== i)).map((rest) => [v, ...rest]),
        );
  for (let count = 3; count <= 6; count++) {
    const names = ['self', 'busy', ...Array.from({ length: count - 2 }, (_, i) => 'quiet-' + i)];
    for (const publishers of permutations(names)) {
      const selected = createReceiveSelection(() => 1000),
        reference = createReceiveSelection(() => 1000),
        own = { publisher: 'self', pending: false, peerBacklog: true };
      const run = (s: ReturnType<typeof createReceiveSelection>, suppress: boolean) => {
        const peers: string[] = [];
        let self = 0;
        while (peers.length < 24) {
          const id = s.next(publishers, suppress ? own : undefined);
          if (id === 'self') self++;
          else peers.push(id);
          s.completed(publishers, id, id === 'busy', suppress && id === 'self');
        }
        return { peers, self };
      };
      const actual = run(selected, true),
        expected = run(reference, false);
      expect(actual.peers).toEqual(expected.peers);
      expect(actual.self).toBeLessThanOrEqual(1);
    }
  }
});

it('does not use backlog to suppress an unverified self check or a receive-only owner', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  s.completed(publishers, 'self', false);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, { publisher: 'self', pending: false, peerBacklog: true })).toBe('self');
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers)).toBe('self');
});

it('keeps pending-self reconciliation ahead of the backlog hint', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, { publisher: 'self', pending: true, peerBacklog: true })).toBe('self');
});

it('finishes the original idle sweep as soon as fresh peer backlog is exhausted', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  const own = { publisher: 'self', pending: false, peerBacklog: true };
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, own)).toBe('busy');
  s.completed(publishers, 'busy', false);
  own.peerBacklog = false;
  expect(s.next(publishers, own)).toBe('a');
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, own)).toBe('self');
});

it('retains self-check expiry, clock rollback, reset and credential binding under peer backlog', () => {
  for (const boundary of ['expiry', 'rollback', 'reset', 'credential']) {
    let now = 1000;
    const s = createReceiveSelection(() => now),
      publishers = ['a', 'self', 'busy'];
    const own = { publisher: 'self', pending: false, peerBacklog: true };
    s.completed(publishers, 'self', false, true);
    s.completed(publishers, 'a', false);
    if (boundary === 'expiry') now += RECEIVE_POLL_MS;
    if (boundary === 'rollback') now--;
    if (boundary === 'reset') {
      s.reset();
      s.completed(publishers, 'a', false);
    }
    if (boundary === 'credential') {
      publishers[1] = 'new-self';
      own.publisher = 'new-self';
    }
    expect(s.next(publishers, own)).toBe(own.publisher);
  }
});

it('takes backlog only from an eligible unconflicted peer and leaves the projection untouched', () => {
  const cursor = (position: number, observedThrough: number): InboundReadCursor => ({
    prefix: { position, observedThrough, link: '00'.repeat(32) },
    conflict: false,
  });
  const peers = new Map([
    ['self', cursor(0, 100)],
    ['busy', cursor(1, 10)],
    ['removed', cursor(0, 100)],
    ['idle', cursor(2, 2)],
    ['conflicted', { ...cursor(0, 100), conflict: true }],
  ]);
  const before = structuredClone(peers);
  expect(hasPeerBacklog(['self', 'idle'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'missing', 'conflicted'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'busy', 'idle'], 'self', peers)).toBe(true);
  expect(hasPeerBacklog(['self'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'busy'], 'self', undefined)).toBe(false);
  expect(peers).toEqual(before);
});

it('drops the scheduling hint immediately when the current retained cursor catches up', () => {
  const peers = new Map<string, InboundReadCursor>([
    [
      'peer',
      { prefix: { position: 3, observedThrough: 4, link: '00'.repeat(32) }, conflict: false },
    ],
  ]);
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(true);
  peers.get('peer')!.prefix.position = 4;
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(false);
  peers.get('peer')!.prefix.position = 5;
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(false);
});
