// @vitest-environment node
// Phase 547: the replay bound is one number, counted the way the cold replay counts it.
import { expect, it } from 'vitest';
import {
  HISTORY_REPLAY_EVENTS,
  HistoryReplayLimit,
  historyReplayPositions,
} from '../src/account/historyReplayBound';
import { HISTORY_REPLAY_EVENTS as REPLAYED, historyReplayStart } from '../src/crdt/historySource';
import type { HistoryCheckpoint } from '../account-protocol/historyCheckpoint';

const head = (credentialId: string, position: number) => ({
  credentialId,
  position,
  link: 'ab'.repeat(32),
});
it('keeps the bound at 4,096 and the replay reads the same constant', () => {
  expect(HISTORY_REPLAY_EVENTS).toBe(4096);
  expect(REPLAYED).toBe(HISTORY_REPLAY_EVENTS);
  const e = new HistoryReplayLimit(4097, 4096);
  expect(e).toBeInstanceOf(Error);
  expect(e.message).toBe('History replay exceeds its event bound');
  expect([e.needed, e.allowed]).toEqual([4097, 4096]);
});

it('counts every publisher from its own start, and a publisher without one from genesis', () => {
  const cuts = [head('a', 3000), head('b', 1200), head('c', 7)];
  expect(historyReplayPositions(cuts, [])).toBe(4207);
  expect(historyReplayPositions(cuts, [head('a', 1000), head('b', 1200)])).toBe(2007);
  // A start past a cut never counts negatively; the replay itself refuses such a baseline.
  expect(historyReplayPositions([head('a', 5)], [head('a', 9)])).toBe(0);
});

it('starts where the replay starts: the previous snapshot it can open, else a handoff, else genesis', () => {
  const previous = {
    manifest: { generation: 2 },
    heads: [head('a', 10)],
  } as unknown as HistoryCheckpoint;
  const recovery = { successor: { epoch: { heads: [head('a', 20)] } } } as never;
  const replacement = { checkpoint: { heads: [head('a', 30)] } } as never;
  expect(historyReplayStart({ previous, keys: new Map([[2, 1]]) })).toEqual([head('a', 10)]);
  expect(historyReplayStart({ previous, keys: new Map([[2, 1]]), recovery, replacement })).toEqual([
    head('a', 10),
  ]);
  // Without the previous snapshot's generation, the device's own baseline is used.
  expect(historyReplayStart({ previous, keys: new Map([[1, 1]]), recovery, replacement })).toEqual([
    head('a', 20),
  ]);
  expect(historyReplayStart({ previous, keys: new Map(), replacement })).toEqual([head('a', 30)]);
  expect(historyReplayStart({ previous: null, keys: new Map([[1, 1]]) })).toEqual([]);
});
