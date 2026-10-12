import { expect, it } from 'vitest';
import { createReceiveSelection, unresolvedSelfSubmission } from '../src/crdt/receiveSelection';
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
