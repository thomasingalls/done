// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createPreparationJournal,
  authenticatePreparationReceipts,
  disposePreparationReceipts,
  PreparationPause,
} from '../src/crdt/retentionPreparation';
import type { Bytes } from '../src/crdt/custodyCrypto';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_QUIET_MS as QUIET,
} from '../src/crdt/automaticLocalRetention';

const context = 'a1'.repeat(32),
  current = () => {};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function receipts(count: number) {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const auth = {
    sign: async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (b: Bytes, mac: Bytes) => crypto.subtle.verify('HMAC', key, mac, b),
  };
  const seed = createPreparationJournal({ context, current, now: () => 0 });
  try {
    for (let n = 1; n <= count; n++)
      await seed.memo.check('spool:' + n, 'scope', [], async () => {}, current);
    const delta = await seed.delta(auth);
    try {
      return await authenticatePreparationReceipts(
        context,
        delta.payload,
        delta.mac,
        auth,
        current,
      );
    } finally {
      delta.payload.fill(0);
      delta.mac.fill(0);
    }
  } finally {
    seed.dispose();
  }
}
it('a long authenticated hit prefix leaves a full fresh-work slice available', async () => {
  let clock = 0;
  const proof = await receipts(64),
    j = createPreparationJournal({ context, current, now: () => clock });
  try {
    j.import(proof);
    const repeated = vi.fn(async () => {
      throw Error('saved hit must not reverify');
    });
    for (let n = 1; n <= 64; n++) {
      clock += 1000;
      await j.memo.check('spool:' + n, 'scope', [], repeated, current);
    }
    expect(j.statistics.hits).toBe(64);
    expect(repeated).not.toHaveBeenCalled();
    for (let n = 65; n <= 72; n++)
      await j.memo.check(
        'spool:' + n,
        'scope',
        [],
        async () => {
          clock += 250;
        },
        current,
      );
    expect(j.statistics.misses).toBe(8);
    const next = vi.fn(async () => {});
    await expect(j.memo.check('spool:73', 'scope', [], next, current)).rejects.toBeInstanceOf(
      PreparationPause,
    );
    expect(next).not.toHaveBeenCalled();
    expect(j.statistics.pending).toBe(8);
  } finally {
    disposePreparationReceipts(proof);
    j.dispose();
  }
});
it('creation and replay do not read the slice clock; the first miss establishes it', async () => {
  const proof = await receipts(1),
    clock = vi.fn(() => 90000),
    j = createPreparationJournal({ context, current, now: clock });
  try {
    j.import(proof);
    await j.memo.check(
      'spool:1',
      'scope',
      [],
      async () => {
        throw Error('hit');
      },
      current,
    );
    expect(clock).not.toHaveBeenCalled();
    await j.memo.check('spool:2', 'scope', [], async () => {}, current);
    expect(clock).toHaveBeenCalledTimes(1);
  } finally {
    disposePreparationReceipts(proof);
    j.dispose();
  }
});
it('hits remain available after the fresh budget expires, but another miss cannot start', async () => {
  let clock = 0;
  const j = createPreparationJournal({ context, current, now: () => clock });
  try {
    await j.memo.check(
      'spool:1',
      'scope',
      [],
      async () => {
        clock = 2001;
      },
      current,
    );
    await j.memo.check(
      'spool:1',
      'scope',
      [],
      async () => {
        throw Error('hit');
      },
      current,
    );
    expect(j.statistics.hits).toBe(1);
    await expect(
      j.memo.check('spool:2', 'scope', [], async () => {}, current),
    ).rejects.toBeInstanceOf(PreparationPause);
  } finally {
    j.dispose();
  }
});
it('a fresh clock does not bypass task or per-check interruption guards', async () => {
  let interrupted = false;
  const stop = () => {
    if (interrupted) throw Error('task stopped');
  };
  const j = createPreparationJournal({ context, current: stop, now: () => 0 });
  try {
    await j.memo.check('spool:1', 'scope', [], async () => {}, stop);
    interrupted = true;
    const verify = vi.fn(async () => {});
    await expect(j.memo.check('spool:2', 'scope', [], verify, stop)).rejects.toThrow(
      'task stopped',
    );
    await expect(j.memo.check('spool:1', 'scope', [], verify, stop)).rejects.toThrow(
      'task stopped',
    );
    expect(verify).not.toHaveBeenCalled();
  } finally {
    j.dispose();
  }
});
it('saved slices start no new attempt during input quiet or receive drain', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let ready = true,
    finish: ((r: { kind: string }) => void) | undefined;
  const remove = vi.fn(
    () =>
      new Promise<{ kind: string }>((resolve) => {
        finish = resolve;
      }),
  );
  const run = createAutomaticLocalRetention({
    signal: new AbortController().signal,
    observe: () => ({ ready, hint: { revision: 0, records: MIN } }),
    remove,
  });
  try {
    run.wake();
    await vi.advanceTimersByTimeAsync(QUIET);
    expect(remove).toHaveBeenCalledTimes(1);
    run.wake();
    finish!({ kind: 'preparation-saved' });
    await vi.advanceTimersByTimeAsync(QUIET - 1);
    expect(remove).toHaveBeenCalledTimes(1);
    ready = false;
    run.refresh();
    await vi.advanceTimersByTimeAsync(QUIET * 10);
    expect(remove).toHaveBeenCalledTimes(1);
    ready = true;
    run.refresh();
    await vi.advanceTimersByTimeAsync(1);
    expect(remove).toHaveBeenCalledTimes(2);
    finish!({ kind: 'skipped' });
    await vi.advanceTimersByTimeAsync(0);
  } finally {
    run.dispose();
  }
});
