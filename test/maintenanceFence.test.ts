// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAdmissionOwner,
  requireMaintenanceFence,
  type AdmissionCarrier,
  type MaintenanceFence,
} from '../src/crdt/admissionQueue';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import type { Bytes } from '../src/crdt/custodyCrypto';
afterEach(() => vi.useRealTimers());
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
async function fixture() {
  const stop = new AbortController(),
    wal: Bytes[] = [],
    disk: Bytes[] = [],
    gate = deferred();
  let fence: MaintenanceFence | undefined,
    entered = false,
    state = 'active';
  const carrier: AdmissionCarrier = {
    get state() {
      return state as AdmissionCarrier['state'];
    },
    signal: stop.signal,
    get observedJournalCharacters() {
      return wal.reduce((n, bytes) => n + bytes.length, 0);
    },
    async close() {
      state = 'closed';
      stop.abort();
    },
    appendLocal(bytes) {
      wal.push(bytes.slice());
      return { status: 'journalled', key: 'j' + wal.length, generation: 1 };
    },
    async appendBatch(input) {
      disk.push(...input.map((v) => v.bytes.slice()));
      return { storeId: 'store', generation: 1, sequences: [disk.length] };
    },
    async flushJournal() {
      const n = wal.length;
      disk.push(...wal.splice(0));
      return { contentReceipts: [], removed: n, retained: 0 };
    },
    async loadRecovery() {
      return { records: [], journal: [] };
    },
    async compactContent(_signal, actual) {
      fence = actual;
      entered = true;
      await gate.promise;
      return {
        status: 'retained',
        storeId: 'store',
        generation: 1,
        stateSequence: null,
        removed: [],
      };
    },
  };
  const owner = await createAdmissionOwner(carrier, {
    prepare: (doc, input) => {
      const text = doc.getText('text');
      text.insert(text.length, new TextDecoder().decode(input));
    },
    validateReceive: () => {},
  });
  return {
    carrier,
    owner,
    gate,
    get fence() {
      return fence!;
    },
    get entered() {
      return entered;
    },
    async start() {
      for (let i = 0; i < 128; i++) await owner.submit(new TextEncoder().encode('x')).accepted;
      await owner.whenDurable();
      await vi.advanceTimersByTimeAsync(750);
      expect(entered).toBe(true);
    },
  };
}
it('forged maintenance fences cannot invoke their supplied checker', () => {
  const check = vi.fn();
  expect(() => requireMaintenanceFence({ check }, {} as AdmissionCarrier)).toThrow(
    'another admission',
  );
  expect(check).not.toHaveBeenCalled();
});
it('only the actual original maintenance head grants its carrier scope and expires at settlement', async () => {
  const f = await fixture();
  vi.useFakeTimers();
  try {
    await f.start();
    expect(() => requireMaintenanceFence(f.fence, f.carrier)).not.toThrow();
    expect(() => requireMaintenanceFence(f.fence, {} as AdmissionCarrier)).toThrow(
      'another admission',
    );
    f.gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(() => requireMaintenanceFence(f.fence, f.carrier)).toThrow('another admission');
  } finally {
    f.gate.resolve();
    await f.owner.close();
  }
});
it('foreground interruption expires commit permission but waits native settlement before later input', async () => {
  const f = await fixture();
  vi.useFakeTimers();
  try {
    await f.start();
    const later = f.owner.submit(new TextEncoder().encode('later'));
    let accepted = false;
    void later.accepted.then(() => (accepted = true));
    expect(() => requireMaintenanceFence(f.fence, f.carrier)).toThrow(MaintenanceInterrupted);
    await vi.advanceTimersByTimeAsync(0);
    expect(accepted).toBe(false);
    f.gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await later.accepted;
    expect(accepted).toBe(true);
    expect(() => requireMaintenanceFence(f.fence, f.carrier)).toThrow();
  } finally {
    f.gate.resolve();
    await f.owner.close();
  }
});
it('closing invalidates a running maintenance capability before the held native operation drains', async () => {
  const f = await fixture();
  vi.useFakeTimers();
  await f.start();
  const closing = f.owner.close();
  expect(() => requireMaintenanceFence(f.fence, f.carrier)).toThrow();
  f.gate.resolve();
  await closing;
  expect(() => requireMaintenanceFence(f.fence, f.carrier)).toThrow();
});
