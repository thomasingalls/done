// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  createAdmissionOwner,
  AdmissionError,
  MAX_PENDING_BYTES,
  type AdmissionOptions,
  type OwnedPreparedReceiveQueue,
} from '../src/crdt/admissionQueue';
import type { JournalSession, JournalRecovery } from '../src/crdt/custody';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { Y, createDoc, applyUpdate } from '../src/crdt/yjs';
import type { PrepareIntent } from '../src/crdt/admissionDocument';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
const bytes = (s: string) => new TextEncoder().encode(s),
  text = (b: Uint8Array) => new TextDecoder().decode(b);
const intent = (s: string) => bytes(s);
const wait = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('Condition not reached');
};
const view = (update: Uint8Array) => {
  const d = createDoc();
  try {
    applyUpdate(d, update);
    return d.getText('text').toString();
  } finally {
    d.destroy();
  }
};
const append: PrepareIntent = (doc, input) => {
  const t = doc.getText('text');
  t.insert(t.length, text(input));
};
const remote = (
  start?: Uint8Array,
  edit = (d: ReturnType<typeof createDoc>) => d.getText('text').insert(0, 'R'),
) => {
  const d = createDoc();
  if (start) applyUpdate(d, start);
  let result!: Bytes;
  d.on('update', (u: Uint8Array) => {
    result = new Uint8Array(u);
  });
  edit(d);
  d.destroy();
  return result;
};
const fixture = async (
  prepare: PrepareIntent = append,
  recovery?: JournalRecovery,
  options: Pick<AdmissionOptions, 'flushBatch' | 'backgroundFlush'> = {},
) => {
  const abort = new AbortController(),
    disk: Bytes[] = [],
    wal: Bytes[] = [],
    calls: string[] = [];
  let refusal = false,
    contentGate: ReturnType<typeof wait> | undefined,
    flushGate: ReturnType<typeof wait> | undefined,
    fail = false,
    flushFail = false,
    state = 'active';
  const carrier = {
    get state() {
      return state;
    },
    signal: abort.signal,
    appendLocal(b: Bytes) {
      calls.push('journal');
      if (refusal) return { status: 'refused', reason: 'quota' };
      wal.push(b.slice());
      return { status: 'journalled', key: 'j' + wal.length, generation: 1 };
    },
    async appendBatch(input: { bytes: Bytes }[]) {
      const captured = input.map((x) => x.bytes.slice());
      calls.push('content-start');
      await contentGate?.promise;
      if (fail) {
        fail = false;
        throw Error('disk failure');
      }
      disk.push(...captured);
      calls.push('content-complete');
      return { storeId: 'store', generation: 1, sequences: [disk.length] };
    },
    async flushJournal() {
      calls.push('flush-start');
      const captured = wal.slice();
      await flushGate?.promise;
      if (flushFail) {
        flushFail = false;
        throw Error('flush failure');
      }
      disk.push(...captured);
      wal.splice(0, captured.length);
      calls.push('flush-complete');
      return { contentReceipts: [], removed: captured.length, retained: 0 };
    },
    async loadRecovery() {
      return (
        recovery ?? {
          records: disk.map((b, i) => ({ kind: 'update', gen: 1, seq: i + 1, bytes: b.slice() })),
          journal: wal.map((b, i) => ({ key: 'j' + i, generation: 1, bytes: b.slice() })),
        }
      );
    },
    async close() {
      state = 'closed';
      abort.abort();
    },
  } as unknown as JournalSession;
  let prepared!: OwnedPreparedReceiveQueue;
  const owner = await createAdmissionOwner(
    carrier,
    {
      prepare,
      validateReceive: () => {},
      ...options,
    },
    (_receive, prepare) => {
      prepared = prepare;
    },
  );
  return {
    prepared,
    owner,
    disk,
    wal,
    calls,
    carrier,
    refuse: () => {
      refusal = true;
    },
    allow: () => {
      refusal = false;
    },
    gateContent: () => (contentGate = wait()),
    gateFlush: () => (flushGate = wait()),
    failContent: () => {
      fail = true;
    },
    failFlush: () => {
      flushFail = true;
    },
  };
};
describe('ordered production admission owner over controlled carriers', () => {
  it('accepts synchronous journal writes before return, with detached snapshots/events and stable local clocks', async () => {
    const f = await fixture();
    try {
      const events: string[] = [];
      f.owner.subscribe((e) => {
        events.push(view(e.update));
        e.update.fill(0);
      });
      const a = f.owner.submit(intent('A'));
      expect(view(f.owner.snapshot())).toBe('A');
      expect(f.wal.length).toBe(1);
      await a.accepted;
      for (const s of ['B', 'C']) await f.owner.submit(intent(s)).accepted;
      expect(view(f.owner.snapshot())).toBe('ABC');
      const d = createDoc();
      applyUpdate(d, f.owner.snapshot());
      expect(Y.decodeStateVector(Y.encodeStateVector(d)).size).toBe(1);
      d.destroy();
      const snapshot = f.owner.snapshot();
      snapshot.fill(0);
      expect(view(f.owner.snapshot())).toBe('ABC');
      expect(events.length).toBe(3);
    } finally {
      await f.owner.close();
    }
  });
  it('prepares a queued intent only after its refused predecessor commits', async () => {
    const prepared: string[] = [];
    const f = await fixture((d, i) => {
      prepared.push(d.getText('text').toString());
      append(d, i, 16384);
    });
    try {
      f.refuse();
      const gate = f.gateContent();
      const a = f.owner.submit(intent('A'));
      const b = f.owner.submit(intent('B'));
      await until(() => f.calls.includes('content-start'));
      expect(prepared).toEqual(['']);
      expect(view(f.owner.snapshot())).toBe('');
      expect(f.wal).toHaveLength(0);
      f.allow();
      gate.resolve();
      await Promise.all([a.accepted, b.accepted]);
      expect(prepared).toEqual(['', 'A']);
      expect(view(f.owner.snapshot())).toBe('AB');
    } finally {
      await f.owner.close();
    }
  });
  it('holds exact prepared bytes and forces content again on retry after a failed forced commit', async () => {
    let prepares = 0;
    const f = await fixture((d, i) => {
      prepares++;
      append(d, i, 16384);
    });
    try {
      f.refuse();
      f.failContent();
      const a = f.owner.submit(intent('A'));
      const b = f.owner.submit(intent('B'));
      await until(() => f.owner.status.state === 'blocked');
      expect(view(f.owner.snapshot())).toBe('');
      expect(f.owner.status.pendingItems).toBe(2);
      expect(prepares).toBe(1);
      await expect(f.owner.whenDurable()).rejects.toBeInstanceOf(AdmissionError);
      f.allow();
      f.owner.retry();
      await Promise.all([a.accepted, b.accepted]);
      expect(prepares).toBe(2);
      expect(f.calls.filter((c) => c === 'content-start')).toHaveLength(2);
      expect(f.wal).toHaveLength(1);
      expect(view(f.owner.snapshot())).toBe('AB');
    } finally {
      await f.owner.close();
    }
  });
  it('commits remote bytes before preparation or publication of dependent local input', async () => {
    const f = await fixture();
    try {
      const gate = f.gateContent();
      const r = f.owner.receive(remote());
      const l = f.owner.submit(intent('L'));
      expect(view(f.owner.snapshot())).toBe('');
      expect(f.calls).toEqual(['content-start']);
      gate.resolve();
      await Promise.all([r.accepted, l.accepted]);
      expect(view(f.owner.snapshot())).toBe('RL');
      expect(f.disk.length).toBe(1);
      expect(f.wal.length).toBe(1);
    } finally {
      await f.owner.close();
    }
  });
  it('persists remote deletion and unresolved structs, including through a cold mixed-carrier replay', async () => {
    const f = await fixture();
    try {
      const source = createDoc();
      source.getText('text').insert(0, 'base');
      const initial = Y.encodeStateAsUpdate(source);
      let deletion!: Bytes;
      source.on('update', (u: Uint8Array) => {
        deletion = new Uint8Array(u);
      });
      source.getText('text').delete(0, 4);
      source.destroy();
      await f.owner.receive(deletion).accepted;
      expect(view(f.owner.snapshot())).toBe('');
      await f.owner.receive(new Uint8Array(initial)).accepted;
      expect(view(f.owner.snapshot())).toBe('');
      await f.owner.submit(intent('L')).accepted;
      const recovered = await fixture(append, await f.carrier.loadRecovery());
      try {
        expect(view(recovered.owner.snapshot())).toBe('L');
      } finally {
        await recovered.owner.close();
      }
    } finally {
      await f.owner.close();
    }
  });
  it('rejects invalid inbound bytes before storage and does not poison a following valid intent', async () => {
    const f = await fixture();
    try {
      await expect(f.owner.receive(new Uint8Array([255])).accepted).rejects.toMatchObject({
        code: 'receive-refused',
      });
      await f.owner.submit(intent('A')).accepted;
      expect(f.disk).toHaveLength(0);
      expect(view(f.owner.snapshot())).toBe('A');
    } finally {
      await f.owner.close();
    }
  });
  it('withholds an invalid local command until its complete pending suffix is explicitly discarded', async () => {
    const f = await fixture(() => {
      throw Error('command');
    });
    try {
      const a = f.owner.submit(intent('A'));
      const b = f.owner.submit(intent('B'));
      expect(f.owner.status.state).toBe('blocked');
      f.owner.discardPending();
      await expect(a.accepted).rejects.toMatchObject({ code: 'discarded' });
      await expect(b.accepted).rejects.toMatchObject({ code: 'discarded' });
      expect(f.owner.status.pendingBytes).toBe(0);
    } finally {
      await f.owner.close();
    }
  });
  it('bounds queued bytes before copying and retains admitted input when capacity refuses', async () => {
    const f = await fixture();
    try {
      f.refuse();
      const gate = f.gateContent();
      const a = f.owner.submit(intent('A'));
      await until(() => f.calls.includes('content-start'));
      expect(() => f.owner.submit(new Uint8Array(MAX_PENDING_BYTES))).toThrow(
        expect.objectContaining({ code: 'queue-full' }),
      );
      expect(f.owner.status.pendingItems).toBe(1);
      gate.resolve();
      await a.accepted;
    } finally {
      await f.owner.close();
    }
  });
  it('captures queued caller bytes and never lends canonical state to a retained draft', async () => {
    let retained: ReturnType<typeof createDoc> | undefined;
    const f = await fixture((d, i) => {
      retained = d;
      append(d, i, 16384);
    });
    try {
      f.refuse();
      const gate = f.gateContent();
      const a = f.owner.submit(intent('A'));
      const value = intent('B');
      const b = f.owner.submit(value);
      value.fill(88);
      await until(() => f.calls.includes('content-start'));
      retained!.getText('text').insert(0, 'INJECT');
      gate.resolve();
      await Promise.all([a.accepted, b.accepted]);
      expect(view(f.owner.snapshot())).toBe('AB');
    } finally {
      await f.owner.close();
    }
  });
  it('enforces prepared-update size before sealing, preserving a resumable pending input', async () => {
    const f = await fixture((d) => {
      d.getText('text').insert(0, 'x'.repeat(17000));
    });
    try {
      f.owner.submit(intent('big'));
      expect(f.owner.status.pressure?.code).toBe('slice-required');
      expect(f.calls).toEqual([]);
      expect(view(f.owner.snapshot())).toBe('');
      expect(f.owner.status.pendingItems).toBe(1);
    } finally {
      await f.owner.close();
    }
  });
  it('commits each oversized-command slice before preparing or publishing its successor', async () => {
    const before: string[] = [];
    const f = await fixture((d, input) => {
      before.push(d.getText('text').toString());
      const s = text(input);
      d.getText('text').insert(d.getText('text').length, s.slice(0, 2));
      if (s.length > 2) return { remaining: bytes(s.slice(2)) };
      return undefined;
    });
    try {
      const gate = f.gateContent();
      const a = f.owner.submit(intent('ABCDE'));
      await until(() => f.calls.includes('content-start'));
      expect(before).toEqual(['']);
      expect(view(f.owner.snapshot())).toBe('');
      gate.resolve();
      expect((await a.accepted).slices).toBe(3);
      expect(before).toEqual(['', 'AB', 'ABCD']);
      expect(view(f.owner.snapshot())).toBe('ABCDE');
      expect(f.wal).toHaveLength(0);
      expect(f.disk).toHaveLength(3);
    } finally {
      await f.owner.close();
    }
  });
  it('places whenDurable after prior inputs and before later input, including a pending predecessor', async () => {
    const f = await fixture();
    try {
      f.refuse();
      const gate = f.gateContent();
      const a = f.owner.submit(intent('A'));
      const barrier = f.owner.whenDurable();
      f.allow();
      const b = f.owner.submit(intent('B'));
      gate.resolve();
      await barrier;
      expect(f.disk.map(view)).toContain('A');
      await Promise.all([a.accepted, b.accepted]);
      expect(f.wal.length).toBe(1);
      expect(f.owner.status.durable).toBe(false);
      await f.owner.whenDurable();
      expect(f.owner.status.durable).toBe(true);
    } finally {
      await f.owner.close();
    }
  });
  it('makes flush failure observable and retains accepted journal bytes for explicit retry', async () => {
    const f = await fixture();
    try {
      await f.owner.submit(intent('A')).accepted;
      f.failFlush();
      await expect(f.owner.whenDurable()).rejects.toThrow();
      await until(() => f.owner.status.state === 'blocked');
      expect(f.wal).toHaveLength(1);
      expect(view(f.owner.snapshot())).toBe('A');
      f.owner.retry();
      await f.owner.whenDurable();
      expect(f.wal).toHaveLength(0);
      expect(f.owner.status.durable).toBe(true);
    } finally {
      await f.owner.close();
    }
  });
  it('automatically flushes after the 250 ms window', async () => {
    vi.useFakeTimers();
    const f = await fixture();
    try {
      await f.owner.submit(intent('A')).accepted;
      await vi.advanceTimersByTimeAsync(249);
      expect(f.disk).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(f.disk).toHaveLength(1);
      expect(f.owner.status.durable).toBe(true);
    } finally {
      await f.owner.close();
      vi.useRealTimers();
    }
  });
  it('allows reentrant observers to queue later intent without changing the accepted event', async () => {
    const f = await fixture();
    try {
      const seen: number[] = [];
      f.owner.subscribe((e) => {
        seen.push(e.revision);
        if (e.revision === 1) f.owner.submit(intent('B'));
        throw Error('observer');
      });
      await f.owner.submit(intent('A')).accepted;
      expect(seen).toEqual([1, 2]);
      expect(view(f.owner.snapshot())).toBe('AB');
    } finally {
      await f.owner.close();
    }
  });
  it('closes admission immediately, drains outstanding work and refuses late promotion and tickets', async () => {
    const f = await fixture();
    f.refuse();
    const gate = f.gateContent();
    const a = f.owner.submit(intent('A'));
    await until(() => f.calls.includes('content-start'));
    const closed = f.owner.close();
    expect(() => f.owner.submit(intent('B'))).toThrow();
    await expect(a.accepted).rejects.toMatchObject({ code: 'inactive-session' });
    expect(f.owner.status.state).toBe('closing');
    gate.resolve();
    await closed;
    expect(f.owner.status.state).toBe('closed');
    expect(f.owner.status.revision).toBe(0);
  });
  it('refuses malformed persisted Yjs even when the byte carrier authenticated it', async () => {
    const r = {
      records: [],
      journal: [{ key: 'bad', generation: 1, bytes: new Uint8Array([255]) }],
    };
    await expect(fixture(append, r)).rejects.toMatchObject({ code: 'repair-required' });
  });
});

describe('admission callback and writer boundaries', () => {
  it('refuses asynchronous preparation and consumes its rejected promise without publishing', async () => {
    const f = await fixture((async () => {
      throw Error('asynchronous command');
    }) as unknown as PrepareIntent);
    try {
      f.owner.submit(intent('A'));
      expect(f.owner.status.pressure?.code).toBe('prepare-failed');
      expect(f.calls).toEqual([]);
      await Promise.resolve();
    } finally {
      await f.owner.close();
    }
  });
  it('restarts a synchronous failed head when a status observer requests retry', async () => {
    let allowed = false;
    const f = await fixture((doc, input) => {
      if (!allowed) throw Error('first');
      append(doc, input, 16384);
    });
    try {
      f.owner.onStatus((s) => {
        if (s.state === 'blocked') {
          allowed = true;
          f.owner.retry();
        }
      });
      await f.owner.submit(intent('A')).accepted;
      expect(view(f.owner.snapshot())).toBe('A');
    } finally {
      await f.owner.close();
    }
  });
  it('uses a fresh local writer if a received update advances the current writer clock', async () => {
    const f = await fixture();
    try {
      await f.owner.submit(intent('A')).accepted;
      const d = createDoc();
      applyUpdate(d, f.owner.snapshot());
      d.clientID = [...Y.decodeStateVector(Y.encodeStateVector(d)).keys()][0]!;
      let collision!: Bytes;
      d.on('update', (u: Uint8Array) => {
        collision = new Uint8Array(u);
      });
      d.getText('text').insert(1, 'R');
      d.destroy();
      await f.owner.receive(collision).accepted;
      await f.owner.submit(intent('L')).accepted;
      const result = createDoc();
      applyUpdate(result, f.owner.snapshot());
      expect(result.getText('text').toString()).toBe('ARL');
      expect(Y.decodeStateVector(Y.encodeStateVector(result)).size).toBe(2);
      result.destroy();
    } finally {
      await f.owner.close();
    }
  });
});

describe('automatic owned content maintenance', () => {
  it('does not replace a known integrity failure with foreground interruption', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    const held = wait();
    let signal: AbortSignal | undefined;
    f.carrier.compactContent = async (interrupt) => {
      signal = interrupt;
      await held.promise;
      throw Object.assign(new Error('Known damaged carrier'), { code: 'repair-required' });
    };
    try {
      for (let i = 0; i < 128; i++) await f.owner.submit(intent('x')).accepted;
      await f.owner.whenDurable();
      await vi.advanceTimersByTimeAsync(750);
      const later = f.owner.submit(intent('later'));
      expect(signal?.aborted).toBe(true);
      held.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.owner.status.state).toBe('blocked');
      expect(f.owner.status.pressure?.code).toBe('repair-required');
      expect(() => f.owner.snapshot()).toThrow('Ordinary snapshots are disabled');
      await f.owner.close();
      await expect(later.accepted).rejects.toMatchObject({ code: 'inactive-session' });
    } finally {
      held.resolve();
      await f.owner.close();
      vi.useRealTimers();
    }
  });
  it.each(['local', 'remote', 'barrier'] as const)(
    '%s interrupts maintenance without overtaking its owned flight; later idle retries',
    async (kind) => {
      const f = await fixture();
      vi.useFakeTimers();
      const held = wait();
      let signal: AbortSignal | undefined;
      let attempts = 0;
      f.carrier.compactContent = async (interrupt) => {
        if (++attempts === 1) {
          signal = interrupt;
          await held.promise;
          if (interrupt?.aborted) throw new MaintenanceInterrupted();
        }
        return {
          status: 'compacted',
          removed: [],
          storeId: 'store',
          generation: 1,
          stateSequence: 129,
        };
      };
      try {
        for (let i = 0; i < 128; i++) await f.owner.submit(intent('x')).accepted;
        await f.owner.whenDurable();
        await vi.advanceTimersByTimeAsync(750);
        expect(attempts).toBe(1);
        const later =
          kind === 'barrier'
            ? f.owner.whenDurable()
            : kind === 'local'
              ? f.owner.submit(intent('later')).accepted
              : f.owner.receive(remote(f.owner.snapshot())).accepted;
        expect(signal?.aborted).toBe(true);
        let settled = false;
        void later.then(() => {
          settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(view(f.owner.snapshot())).toBe('x'.repeat(128));
        held.resolve();
        await later;
        expect(f.owner.status.state).toBe('active');
        expect(f.owner.status.pressure).toBeNull();
        expect(view(f.owner.snapshot())).toBe(
          kind === 'local'
            ? 'x'.repeat(128) + 'later'
            : kind === 'remote'
              ? 'R' + 'x'.repeat(128)
              : 'x'.repeat(128),
        );
        await f.owner.whenDurable();
        await vi.advanceTimersByTimeAsync(750);
        expect(attempts).toBe(2);
        await vi.advanceTimersByTimeAsync(10000);
        expect(attempts).toBe(2);
      } finally {
        held.resolve();
        await f.owner.close();
        vi.useRealTimers();
      }
    },
  );
  it('waits for durable idle, orders later input, and closes a running flight without further admission', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    const gate = wait();
    const compact = vi.fn(async () => {
      await gate.promise;
      return {
        status: 'compacted' as const,
        removed: [],
        storeId: 'store',
        generation: 1,
        stateSequence: 129,
      };
    });
    f.carrier.compactContent = compact as JournalSession['compactContent'];
    try {
      for (let i = 0; i < 128; i++) await f.owner.submit(intent('x')).accepted;
      await vi.advanceTimersByTimeAsync(249);
      expect(compact).not.toHaveBeenCalled();
      await f.owner.whenDurable();
      await vi.advanceTimersByTimeAsync(749);
      expect(compact).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(compact).toHaveBeenCalledTimes(1);
      const later = f.owner.submit(intent('later'));
      expect(view(f.owner.snapshot())).toBe('x'.repeat(128));
      expect(f.owner.status.pendingItems).toBe(1);
      const closing = f.owner.close();
      await expect(later.accepted).rejects.toMatchObject({ code: 'inactive-session' });
      gate.resolve();
      await closing;
      await vi.advanceTimersByTimeAsync(100000);
      expect(compact).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await f.owner.close();
      vi.useRealTimers();
    }
  });
  it.each(['retained', 'failure'] as const)(
    'does not spin or block editing after %s; only new durable growth retries',
    async (mode) => {
      const f = await fixture();
      vi.useFakeTimers();
      const compact = vi.fn(async () => {
        if (mode === 'failure') throw Error('quota');
        return {
          status: 'retained' as const,
          removed: [],
          storeId: 'store',
          generation: 1,
          stateSequence: null,
        };
      });
      f.carrier.compactContent = compact as JournalSession['compactContent'];
      try {
        for (let cycle = 0; cycle < 2; cycle++) {
          for (let i = 0; i < 128; i++) await f.owner.submit(intent('x')).accepted;
          await f.owner.whenDurable();
          await vi.advanceTimersByTimeAsync(100000);
          expect(compact).toHaveBeenCalledTimes(cycle + 1);
          expect(f.owner.status.state).toBe('active');
          expect(f.owner.status.maintenance).toBe(mode === 'retained' ? 'retained' : 'deferred');
        }
        expect(view(f.owner.snapshot())).toBe('x'.repeat(256));
      } finally {
        await f.owner.close();
        vi.useRealTimers();
      }
    },
  );
});

it.each([false, true])(
  'generated flush/idle schedules preserve every admitted input and bound maintenance attempts, background %s',
  async (background) => {
    vi.useFakeTimers();
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              count: fc.integer({ min: 1, max: 70 }),
              idle: fc.integer({ min: 0, max: 1100 }),
              flush: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          async (groups) => {
            const f = await fixture(append, undefined, background ? { backgroundFlush: true } : {});
            const compact = vi.fn(async () => ({
              status: 'compacted' as const,
              removed: [],
              storeId: 'store',
              generation: 1,
              stateSequence: 129,
            }));
            f.carrier.compactContent = compact as JournalSession['compactContent'];
            let count = 0;
            try {
              for (const group of groups) {
                for (let i = 0; i < group.count; i++) {
                  await f.owner.submit(intent('x')).accepted;
                  count++;
                }
                if (group.flush) await f.owner.whenDurable();
                await vi.advanceTimersByTimeAsync(group.idle);
                expect(view(f.owner.snapshot())).toBe('x'.repeat(count));
                expect(compact.mock.calls.length).toBeLessThanOrEqual(Math.floor(count / 128));
              }
              await f.owner.whenDurable();
              await vi.advanceTimersByTimeAsync(1000);
              if (count >= 128) expect(compact).toHaveBeenCalled();
              expect(f.owner.status.state).toBe('active');
            } finally {
              await f.owner.close();
            }
          },
        ),
        { seed: 120916, numRuns: 24 },
      );
    } finally {
      vi.useRealTimers();
    }
  },
);

it('80 generated preparation traces preserve the accepted basis through retry discard and remote delivery', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          route: fc.constantFrom('journal', 'retry', 'discard', 'remote'),
          value: fc.string({ minLength: 1, maxLength: 4 }),
        }),
        { maxLength: 12 },
      ),
      async (actions) => {
        let f: Awaited<ReturnType<typeof fixture>>;
        const seen: {
          basis: string;
          revision: number;
          writer: number;
          input: Bytes;
          draft: ReturnType<typeof createDoc>;
        }[] = [];
        f = await fixture((draft, input) => {
          seen.push({
            basis: draft.getText('text').toString(),
            revision: f.owner.status.revision,
            writer: draft.clientID,
            input,
            draft,
          });
          append(draft, input, 16384);
        });
        let expected = '',
          revision = 0;
        try {
          for (const action of [{ route: 'journal', value: 'base' }, ...actions]) {
            const before = seen.length,
              value = 'x' + action.value;
            f.allow();
            if (action.route === 'remote') {
              const update = remote(f.owner.snapshot(), (d) =>
                d.getText('text').insert(d.getText('text').length, value),
              );
              await f.owner.receive(update).accepted;
              expected += value;
              revision++;
              expect(seen.length).toBe(before);
            } else {
              if (action.route !== 'journal') {
                f.refuse();
                f.failContent();
              }
              const ticket = f.owner.submit(intent(value));
              await until(() => seen.length > before);
              expect(seen.length).toBe(before + 1);
              expect(seen.at(-1)!.basis, 'preparation must use the accepted predecessor').toBe(
                expected,
              );
              expect(seen.at(-1)!.revision).toBe(revision);
              expect(seen.at(-1)!.draft.isDestroyed).toBe(true);
              expect(seen.at(-1)!.input.every((b) => b === 0)).toBe(true);
              if (action.route !== 'journal') {
                await until(() => f.owner.status.state === 'blocked');
                expect(view(f.owner.snapshot()), 'failed storage cannot promote').toBe(expected);
                expect(f.owner.status.revision).toBe(revision);
                if (action.route === 'discard') {
                  f.owner.discardPending();
                  await expect(ticket.accepted).rejects.toHaveProperty('code', 'discarded');
                } else {
                  f.allow();
                  f.owner.retry();
                  await ticket.accepted;
                  expect(seen.length, 'a storage retry must reuse its preparation').toBe(
                    before + 1,
                  );
                  expected += value;
                  revision++;
                }
              } else {
                await ticket.accepted;
                expected += value;
                revision++;
              }
            }
            expect(view(f.owner.snapshot())).toBe(expected);
            expect(f.owner.status.revision).toBe(revision);
            const cold = createDoc();
            try {
              for (const update of [...f.disk, ...f.wal]) applyUpdate(cold, update);
              expect(
                cold.getText('text').toString(),
                'cold carriers must match the independent accepted ledger',
              ).toBe(expected);
            } finally {
              cold.destroy();
            }
          }
        } finally {
          await f.owner.close();
        }
      },
    ),
    { seed: 140922, numRuns: 80 },
  );
});

it('preparation revisions advance for no ops and new work uses the writer chosen after remote collision', async () => {
  const seen: { revision: number; writer: number; basis: string }[] = [];
  let f: Awaited<ReturnType<typeof fixture>>;
  f = await fixture((draft, input) => {
    seen.push({
      revision: f.owner.status.revision,
      writer: draft.clientID,
      basis: draft.getText('text').toString(),
    });
    if (text(input) !== 'noop') append(draft, input, 16384);
  });
  try {
    await f.owner.submit(intent('A')).accepted;
    const before = f.owner.snapshot(),
      writer = seen[0]!.writer;
    await f.owner.submit(intent('noop')).accepted;
    expect(f.owner.snapshot()).toEqual(before);
    expect(f.owner.status.revision).toBe(2);
    const collision = remote(before, (d) => {
      d.clientID = writer;
      d.getText('text').insert(1, 'R');
    });
    await f.owner.receive(collision).accepted;
    await f.owner.submit(intent('L')).accepted;
    expect(seen.map((s) => s.revision)).toEqual([0, 1, 3]);
    expect(seen.map((s) => s.basis)).toEqual(['', 'A', 'AR']);
    expect(seen[2]!.writer, 'a preparation binding cannot retain a collided writer').not.toBe(
      writer,
    );
    expect(view(f.owner.snapshot())).toBe('ARL');
  } finally {
    await f.owner.close();
  }
});

it('Account flush window keeps immediate journal admission, a hard deadline, and explicit barriers', async () => {
  vi.useFakeTimers();
  const f = await fixture(append, undefined, { flushBatch: { quietMs: 300, maxMs: 1000 } });
  try {
    for (let i = 0; i < 10; i++) {
      await f.owner.submit(intent('x')).accepted;
      expect(f.wal.length).toBe(i + 1);
      expect(view(f.owner.snapshot())).toBe('x'.repeat(i + 1));
      expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(1);
    expect(f.wal).toHaveLength(0);
    await f.owner.submit(intent('y')).accepted;
    await vi.advanceTimersByTimeAsync(299);
    expect(f.wal).toHaveLength(1);
    await f.owner.whenDurable();
    expect(f.wal).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(2);
  } finally {
    await f.owner.close();
    vi.useRealTimers();
  }
});

it('locking before a batched flush retains the journal for cold recovery and cancels its timer', async () => {
  vi.useFakeTimers();
  const f = await fixture(append, undefined, { flushBatch: { quietMs: 300, maxMs: 1000 } });
  try {
    await f.owner.submit(intent('saved before lock')).accepted;
    await f.owner.close();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(0);
    const restored = await fixture(append, await f.carrier.loadRecovery());
    try {
      expect(view(restored.owner.snapshot())).toBe('saved before lock');
    } finally {
      await restored.owner.close();
    }
  } finally {
    await f.owner.close();
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'timed flush overlap %s preserves immediate journal admission and its suffix',
  async (background) => {
    vi.useFakeTimers();
    const f = await fixture(append, undefined, background ? { backgroundFlush: true } : {});
    const gate = f.gateFlush();
    try {
      await f.owner.submit(intent('A')).accepted;
      await vi.advanceTimersByTimeAsync(250);
      const b = f.owner.submit(intent('B'));
      expect(view(f.owner.snapshot())).toBe(background ? 'AB' : 'A');
      expect(f.wal.length).toBe(background ? 2 : 1);
      expect(f.owner.status.durable).toBe(false);
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await b.accepted;
      expect(f.disk).toHaveLength(1);
      expect(f.wal).toHaveLength(1);
      expect(f.owner.status.durable).toBe(false);
      await f.owner.whenDurable();
      expect(f.disk).toHaveLength(2);
      expect(f.wal).toHaveLength(0);
      expect(f.owner.status.durable).toBe(true);
    } finally {
      gate.resolve();
      await f.owner.close();
      vi.useRealTimers();
    }
  },
);

it.each(['barrier', 'remote'] as const)(
  'a %s behind a timed flush fences later local inputs',
  async (kind) => {
    vi.useFakeTimers();
    const prepared: string[] = [];
    const f = await fixture(
      (d, i) => {
        prepared.push(text(i));
        append(d, i, 16384);
      },
      undefined,
      { backgroundFlush: true },
    );
    const gate = f.gateFlush();
    try {
      await f.owner.submit(intent('A')).accepted;
      await vi.advanceTimersByTimeAsync(250);
      await f.owner.submit(intent('B')).accepted;
      const fence =
        kind === 'barrier'
          ? f.owner.whenDurable()
          : f.owner.receive(remote(f.owner.snapshot())).accepted;
      const c = f.owner.submit(intent('C'));
      expect(prepared).toEqual(['A', 'B']);
      expect(view(f.owner.snapshot())).toBe('AB');
      gate.resolve();
      await Promise.all([fence, c.accepted]);
      expect(view(f.owner.snapshot())).toBe(kind === 'barrier' ? 'ABC' : 'RABC');
      expect(f.calls.indexOf('flush-complete')).toBeLessThan(f.calls.lastIndexOf('journal'));
    } finally {
      gate.resolve();
      await f.owner.close();
      vi.useRealTimers();
    }
  },
);

it.each([false, true])(
  'journal refusal behind a timed flush waits for storage; failure %s retains the suffix',
  async (fail) => {
    vi.useFakeTimers();
    const f = await fixture(append, undefined, { backgroundFlush: true });
    const gate = f.gateFlush(),
      content = f.gateContent();
    try {
      await f.owner.submit(intent('A')).accepted;
      await vi.advanceTimersByTimeAsync(250);
      await f.owner.submit(intent('B')).accepted;
      f.refuse();
      const c = f.owner.submit(intent('C'));
      f.allow();
      const d = f.owner.submit(intent('D'));
      expect(view(f.owner.snapshot())).toBe('AB');
      expect(f.calls).not.toContain('content-start');
      if (fail) f.failFlush();
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
      if (fail) {
        expect(f.owner.status.state).toBe('blocked');
        expect(f.wal).toHaveLength(2);
        expect(f.calls).not.toContain('content-start');
        f.owner.retry();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(f.calls).toContain('content-start');
      expect(view(f.owner.snapshot())).toBe('AB');
      content.resolve();
      await Promise.all([c.accepted, d.accepted]);
      expect(view(f.owner.snapshot())).toBe('ABCD');
      expect(f.wal).toHaveLength(1);
      await f.owner.whenDurable();
      expect(f.disk).toHaveLength(4);
    } finally {
      gate.resolve();
      content.resolve();
      await f.owner.close();
      vi.useRealTimers();
    }
  },
);

it('a failed background flush blocks pending barriers and retains acknowledged journal inputs for recovery', async () => {
  vi.useFakeTimers();
  const f = await fixture(append, undefined, { backgroundFlush: true });
  const gate = f.gateFlush();
  try {
    await f.owner.submit(intent('A')).accepted;
    await vi.advanceTimersByTimeAsync(250);
    await f.owner.submit(intent('B')).accepted;
    const refusal = expect(f.owner.whenDurable()).rejects.toThrow('flush failure');
    f.failFlush();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await refusal;
    expect(f.owner.status.state).toBe('blocked');
    expect(f.wal).toHaveLength(2);
    expect(view(f.owner.snapshot())).toBe('AB');
    const recovered = await fixture(append, await f.carrier.loadRecovery());
    expect(view(recovered.owner.snapshot())).toBe('AB');
    await recovered.owner.close();
    f.owner.retry();
    await f.owner.whenDurable();
    expect(f.owner.status.durable).toBe(true);
  } finally {
    gate.resolve();
    await f.owner.close();
    vi.useRealTimers();
  }
});

it('a background flush preserves the next batch deadline without overlapping copies', async () => {
  vi.useFakeTimers();
  const f = await fixture(append, undefined, {
    backgroundFlush: true,
    flushBatch: { quietMs: 300, maxMs: 1000 },
  });
  const gate = f.gateFlush();
  try {
    await f.owner.submit(intent('A')).accepted;
    await vi.advanceTimersByTimeAsync(300);
    await f.owner.submit(intent('B')).accepted;
    await vi.advanceTimersByTimeAsync(100);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(f.wal).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls.filter((c) => c === 'flush-start')).toHaveLength(2);
    expect(f.owner.status.durable).toBe(true);
  } finally {
    gate.resolve();
    await f.owner.close();
    vi.useRealTimers();
  }
});

it('close drains the background copy and retains its newer journal suffix without late publication', async () => {
  vi.useFakeTimers();
  const f = await fixture(append, undefined, { backgroundFlush: true });
  const gate = f.gateFlush();
  try {
    await f.owner.submit(intent('A')).accepted;
    await vi.advanceTimersByTimeAsync(250);
    await f.owner.submit(intent('B')).accepted;
    let closed = false;
    const closing = f.owner.close().then(() => {
      closed = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(closed).toBe(false);
    expect(f.owner.status.state).toBe('closing');
    gate.resolve();
    await closing;
    expect(f.wal).toHaveLength(1);
    const recovered = await fixture(append, await f.carrier.loadRecovery());
    expect(view(recovered.owner.snapshot())).toBe('AB');
    await recovered.owner.close();
  } finally {
    gate.resolve();
    await f.owner.close();
    vi.useRealTimers();
  }
});

describe('prepared owned remote handoff', () => {
  it('journals during preparation, then applies original frames to the current document after durable storage', async () => {
    const f = await fixture(),
      gate = wait(),
      begun = wait();
    const update = remote();
    const work = f.prepared(update, async (input, stage) => {
      begun.resolve();
      await gate.promise;
      f.disk.push(input.slice());
      stage([input], async (apply) => {
        apply();
      });
      return 7;
    });
    await begun.promise;
    expect(f.owner.status.durable).toBe(false);
    await f.owner.submit(intent('LOCAL')).accepted;
    expect(view(f.owner.snapshot())).toBe('LOCAL');
    expect(f.wal).toHaveLength(1);
    let durable = false;
    const barrier = f.owner.whenDurable().then(() => {
      durable = true;
    });
    await Promise.resolve();
    expect(durable).toBe(false);
    gate.resolve();
    expect(await work).toBe(7);
    await barrier;
    expect(view(f.owner.snapshot())).toContain('LOCAL');
    expect(view(f.owner.snapshot())).toContain('R');
    const reopened = await fixture(append, {
      records: f.disk.map((bytes, i) => ({
        kind: 'update',
        gen: 1,
        seq: i + 1,
        bytes: bytes.slice(),
      })),
      journal: [],
    });
    expect(view(reopened.owner.snapshot())).toBe(view(f.owner.snapshot()));
    await reopened.owner.close();
    await f.owner.close();
  });
  it.each(['retry', 'discard'] as const)(
    'a durable proposal cannot bypass a refused local head: %s',
    async (action) => {
      const f = await fixture(),
        gate = wait(),
        staged = wait();
      const work = f.prepared(remote(), async (input, stage) => {
        await gate.promise;
        f.disk.push(input.slice());
        stage([input], async (apply) => {
          apply();
        });
        staged.resolve();
      });
      void work.catch(() => {});
      f.refuse();
      f.failContent();
      const local = f.owner.submit(intent('L'));
      void local.accepted.catch(() => {});
      await until(() => f.owner.status.state === 'blocked');
      gate.resolve();
      await staged.promise;
      await until(() => f.owner.status.pendingItems === 2);
      expect(view(f.owner.snapshot())).toBe('');
      if (action === 'retry') {
        f.owner.retry();
        await local.accepted;
        await work;
        expect(view(f.owner.snapshot())).toContain('L');
        expect(view(f.owner.snapshot())).toContain('R');
      } else {
        f.owner.discardPending();
        await expect(work).rejects.toMatchObject({ code: 'inactive-session' });
        await until(() => ['closed', 'failed'].includes(f.owner.status.state));
        expect(f.disk).toHaveLength(1);
      }
      await f.owner.close();
    },
  );
  it('releases preparation before a forced local write and final recheck, without deadlocking', async () => {
    const f = await fixture(),
      gate = wait(),
      write = f.gateContent();
    const work = f.prepared(remote(), async (input, stage) => {
      await gate.promise;
      f.disk.push(input.slice());
      stage([input], async (apply) => {
        apply();
      });
      write.resolve();
    });
    f.refuse();
    const local = f.owner.submit(intent('L'));
    await until(() => f.calls.includes('content-start'));
    gate.resolve();
    await local.accepted;
    await work;
    expect(view(f.owner.snapshot()).length).toBe(2);
    await f.owner.close();
  });
  it('refuses a stale final authority check and closes for cold replay', async () => {
    const f = await fixture();
    const work = f.prepared(remote(), async (input, stage) => {
      f.disk.push(input.slice());
      stage([input], async () => {
        throw Error('authority changed');
      });
    });
    await expect(work).rejects.toThrow();
    await f.owner.close();
    expect(f.disk).toHaveLength(1);
  });
  it('close drains pending preparation and never applies or retains late buffers', async () => {
    const f = await fixture(),
      gate = wait(),
      begun = wait();
    let owned!: Bytes;
    const work = f.prepared(remote(), async (input, stage) => {
      owned = input;
      begun.resolve();
      await gate.promise;
      stage([input], async (apply) => {
        apply();
      });
    });
    void work.catch(() => {});
    await begun.promise;
    let closed = false;
    const closing = f.owner.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    gate.resolve();
    await closing;
    await expect(work).rejects.toThrow();
    expect(owned.every((b) => b === 0)).toBe(true);
  });
  it('bounds concurrent proposals and erases detached inputs on invalid verification', async () => {
    const f = await fixture(),
      gate = wait(),
      begun = wait();
    let owned!: Bytes;
    const bytes = remote();
    const work = f.prepared(bytes, async (input) => {
      owned = input;
      begun.resolve();
      await gate.promise;
      throw new AdmissionError('receive-refused', 'bad signature');
    });
    bytes.fill(0);
    await begun.promise;
    expect(owned.some((b) => b !== 0)).toBe(true);
    expect(() => f.prepared(remote(), async () => {})).toThrow(/pending/);
    gate.resolve();
    await expect(work).rejects.toMatchObject({ code: 'receive-refused' });
    expect(owned.every((b) => b === 0)).toBe(true);
    await f.owner.submit(intent('L')).accepted;
    await f.owner.close();
  });
});

it('a page arriving after local pressure is prepared but its final apply waits for that local head', async () => {
  const f = await fixture();
  try {
    f.refuse();
    f.failContent();
    const local = f.owner.submit(intent('L'));
    void local.accepted.catch(() => {});
    await until(() => f.owner.status.state === 'blocked');
    const received = f.prepared(remote(), async (input, stage) => {
      f.disk.push(input.slice());
      stage([input], async (apply) => {
        apply();
      });
    });
    await until(() => f.owner.status.pendingItems === 2);
    expect(view(f.owner.snapshot())).toBe('');
    f.owner.retry();
    await local.accepted;
    await received;
    expect(view(f.owner.snapshot())).toContain('L');
    expect(view(f.owner.snapshot())).toContain('R');
  } finally {
    await f.owner.close();
  }
});
