// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAdmissionOwner,
  requireAdmissionFence,
  type AdmissionCarrier,
  type AdmissionFence,
  type OwnedJournalFenceQueue,
} from '../src/crdt/admissionQueue';
import { createDoc, applyUpdate } from '../src/crdt/yjs';
import type { Bytes } from '../src/crdt/custodyCrypto';
const bytes = (text: string) => new TextEncoder().encode(text);
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
async function fixture() {
  const stop = new AbortController(),
    disk: Bytes[] = [],
    journal: Bytes[] = [];
  let state: AdmissionCarrier['state'] = 'active',
    hold: ReturnType<typeof deferred> | undefined,
    retained = false,
    fail = false;
  const carrier: AdmissionCarrier = {
    get state() {
      return state;
    },
    signal: stop.signal,
    observedJournalCharacters: 0,
    close: async () => {
      state = 'closed';
      stop.abort();
      hold?.resolve();
    },
    loadRecovery: async () => ({
      records: disk.map((b, i) => ({ kind: 'update', gen: 1, seq: i + 1, bytes: b.slice() })),
      journal: journal.map((b, i) => ({ key: 'fixture' + i, generation: 1, bytes: b.slice() })),
    }),
    appendLocal: (input) => {
      journal.push(input.slice());
      return { status: 'journalled', key: 'fixture' + journal.length, generation: 1 };
    },
    appendBatch: async (input) => {
      disk.push(...input.map((r) => r.bytes.slice()));
      return { storeId: 'fixture', generation: 1, sequences: [disk.length] };
    },
    flushJournal: async () => {
      await hold?.promise;
      if (fail) throw Error('Uncertain flush');
      if (retained) return { contentReceipts: [], removed: 0, retained: journal.length };
      const removed = journal.length;
      disk.push(...journal.splice(0));
      return { contentReceipts: [], removed, retained: 0 };
    },
  };
  let fence!: OwnedJournalFenceQueue;
  const owner = await createAdmissionOwner(
    carrier,
    {
      prepare: (doc, input) => {
        const text = doc.getText('text');
        text.insert(text.length, new TextDecoder().decode(input));
      },
      validateReceive: () => {
        throw Error('No unsigned receive');
      },
    },
    (_r, _p, f) => {
      fence = f;
    },
  );
  stops.push(() => owner.close());
  const read = () => {
    const doc = createDoc();
    try {
      applyUpdate(doc, owner.snapshot());
      return doc.getText('text').toString();
    } finally {
      doc.destroy();
    }
  };
  return {
    owner,
    carrier,
    fence,
    disk,
    journal,
    read,
    holdFlush() {
      hold = deferred();
      return hold;
    },
    retain() {
      retained = true;
    },
    fail() {
      fail = true;
    },
    allow() {
      fail = false;
      retained = false;
    },
  };
}
it('flushes the actual queue-head journal even when input followed an earlier durability barrier', async () => {
  const f = await fixture();
  await f.owner.whenDurable();
  await f.owner.submit(bytes('after external barrier')).accepted;
  expect(f.journal).toHaveLength(1);
  const observed = await f.fence(async (capability) => {
    requireAdmissionFence(capability, f.carrier);
    return { remaining: f.journal.length, nativeCopies: f.disk.length, text: f.read() };
  });
  expect(observed.remaining).toBe(0);
  expect(observed.nativeCopies).toBeGreaterThan(0);
  expect(observed.text).toBe('after external barrier');
  expect(f.owner.status.durable).toBe(true);
});
it('queued local input remains outside the fenced operation until its acknowledgment completes', async () => {
  const f = await fixture(),
    entered = deferred(),
    held = deferred();
  let token!: AdmissionFence;
  const work = f.fence(async (capability) => {
    token = capability;
    entered.resolve();
    await held.promise;
    requireAdmissionFence(capability, f.carrier);
  });
  await entered.promise;
  const ticket = f.owner.submit(bytes('next turn'));
  expect(f.read()).toBe('');
  expect(f.journal).toHaveLength(0);
  requireAdmissionFence(token, f.carrier);
  held.resolve();
  await work;
  await ticket.accepted;
  expect(f.read()).toBe('next turn');
});
it('forged, wrong-owner and expired fence capabilities refuse', async () => {
  const f = await fixture(),
    other = await fixture();
  let token!: AdmissionFence;
  expect(() => requireAdmissionFence({ check() {} }, f.carrier)).toThrow('another admission owner');
  await f.fence(async (capability) => {
    token = capability;
    requireAdmissionFence(capability, f.carrier);
    expect(() => requireAdmissionFence(capability, other.carrier)).toThrow(
      'another admission owner',
    );
  });
  expect(() => requireAdmissionFence(token, f.carrier)).toThrow();
  expect(() => token.check()).toThrow('no longer at its queue head');
});
it('uncertain retained cleanup never lends a fence or claims durability', async () => {
  const f = await fixture();
  await f.owner.submit(bytes('retained')).accepted;
  f.retain();
  const operation = vi.fn(async () => {});
  const pending = f.fence(operation);
  await vi.waitFor(() => expect(f.owner.status.state).toBe('blocked'));
  expect(operation).not.toHaveBeenCalled();
  expect(f.journal).toHaveLength(1);
  expect(f.owner.status.durable).toBe(false);
  f.allow();
  f.owner.retry();
  await pending;
  expect(operation).toHaveBeenCalledOnce();
  expect(f.journal).toHaveLength(0);
});
it('a failed flush cannot run the mutation callback', async () => {
  const f = await fixture();
  await f.owner.submit(bytes('uncommitted')).accepted;
  f.fail();
  const operation = vi.fn(async () => {});
  const pending = f.fence(operation);
  await vi.waitFor(() => expect(f.owner.status.state).toBe('blocked'));
  expect(operation).not.toHaveBeenCalled();
  expect(f.journal).toHaveLength(1);
  f.allow();
  f.owner.retry();
  await pending;
  expect(operation).toHaveBeenCalledOnce();
});
it('close while the head flush is held cannot mint a late capability', async () => {
  const f = await fixture(),
    hold = f.holdFlush(),
    operation = vi.fn(async () => {});
  const work = f.fence(operation);
  const rejected = expect(work).rejects.toThrow();
  await Promise.resolve();
  const closed = f.owner.close();
  hold.resolve();
  await rejected;
  await closed;
  expect(operation).not.toHaveBeenCalled();
});
it('an empty fenced effect preserves canonical state and emits no document publication', async () => {
  const f = await fixture(),
    listener = vi.fn(),
    before = f.owner.snapshot();
  const off = f.owner.subscribe(listener);
  await f.fence(async () => 42);
  expect(f.owner.snapshot()).toEqual(before);
  expect(listener).not.toHaveBeenCalled();
  off();
});
it('a fenced operation cannot publish twice or reuse its capability after failure', async () => {
  const f = await fixture();
  let token!: AdmissionFence;
  const work = f.fence(async (capability, publish) => {
    token = capability;
    publish([]);
    publish([]);
  });
  const cancelled = expect(work).rejects.toThrow();
  await vi.waitFor(() => expect(f.owner.status.state).toBe('blocked'));
  expect(() => requireAdmissionFence(token, f.carrier)).toThrow();
  expect(f.owner.status.state).toBe('blocked');
  await f.owner.close();
  await cancelled;
});
