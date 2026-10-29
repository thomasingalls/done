// @vitest-environment node
/** Controlled bootstrap ordering only; actual Account authentication is exercised in the native packet. */
import { expect, it } from 'vitest';
import { createWorkerAccountComposition } from '../src/crdt/workerAccountComposition';
import type { AccountWorkspaceOwnerContext } from '../src/crdt/accountWorkspacePort';
import type { AdmissionCarrier, AdmissionStatus } from '../src/crdt/admissionQueue';
import type { WorkerChannel } from '../src/crdt/workerChannel';
import type { installAccountWorkerRuntime } from '../src/crdt/accountWorkerRuntime';
const status = (revision = 0): AdmissionStatus => ({
  state: 'active',
  revision,
  pendingItems: 0,
  pendingBytes: 0,
  reservedBytes: 0,
  durable: true,
  pressure: null,
});
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture(hold = false, refuse = false) {
  const stop = new AbortController(),
    events: string[] = [],
    openingGate = gate(),
    key = new Uint8Array(32).fill(7);
  let bridge!: ReturnType<typeof createWorkerAccountComposition>,
    nativeCloses = 0,
    copies = 0;
  const carrier = {
    close: async () => {
      nativeCloses++;
    },
  } as unknown as AdmissionCarrier;
  const owner = {
    carrier,
    copyMirrorOpening: async () => {
      copies++;
      events.push('copy-native-context');
      return { dbName: 'done.' + '01'.repeat(16), key, previous: [] };
    },
  } as unknown as AccountWorkspaceOwnerContext;
  const runtime = {
    signal: stop.signal,
    ticket: { incarnation: '02'.repeat(16) },
    finishOpening: () => events.push('finish-opening'),
  } as unknown as ReturnType<typeof installAccountWorkerRuntime>;
  const channel = {
    request: async (method: string, input: any) => {
      events.push(method);
      if (method === 'workspaceOpen') {
        expect(input.opening.key).toBe(key);
        expect(input.deviceId).toBe('actual-native-device');
        if (hold) await openingGate.promise;
        if (refuse) throw Error('Window mirror refused');
        return status();
      }
      if (method === 'workspaceObserve') {
        bridge.methods.workspaceHint({
          sequence: 1,
          status: status(4),
          changed: false,
          local: false,
        });
        return;
      }
      if (method === 'workspaceDurable') return;
      throw Error('Unexpected protocol request');
    },
  } as unknown as WorkerChannel;
  bridge = createWorkerAccountComposition({
    channel,
    runtime,
    live: () => stop.signal.throwIfAborted(),
    failed: () => stop.abort(),
    owned: (actual, prefix) => {
      expect(actual).toBe(owner);
      expect(prefix).toContain('done.');
      events.push('actual-native-owner');
    },
  });
  const options = {
    identity: {
      id: '03'.repeat(16),
      actor: { kind: 'human' as const, name: 'Fixture', color: '#e0662f' },
      device: { id: 'fixture', name: 'Fixture' },
    },
  };
  return {
    bridge,
    owner,
    carrier,
    events,
    key,
    openingGate,
    stop,
    options,
    copies: () => copies,
    closes: () => nativeCloses,
  };
}
it('captures the actual owner before reentrant Window recovery and installs observation before activation', async () => {
  const f = fixture(),
    result = await f.bridge.factory(f.carrier, 'actual-native-device', f.options, f.owner);
  expect(f.events).toEqual([
    'copy-native-context',
    'actual-native-owner',
    'workspaceOpen',
    'workspaceObserve',
    'finish-opening',
  ]);
  expect(f.copies()).toBe(1);
  expect(f.bridge.ready).toBe(true);
  expect(f.key.every((v) => v === 0)).toBe(true);
  expect(result.workspace.status.revision).toBe(4);
  await result.workspace.whenDurable();
  expect(f.events.at(-1)).toBe('workspaceDurable');
  await result.workspace.close();
  expect(f.closes()).toBe(1);
  await f.bridge.close();
});
it('a Window opening still in flight cannot be treated as an activated native composition', async () => {
  const f = fixture(true),
    work = f.bridge.factory(f.carrier, 'actual-native-device', f.options, f.owner);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.bridge.ready).toBe(false);
  expect(f.events).not.toContain('finish-opening');
  f.openingGate.resolve();
  await work;
  expect(f.bridge.ready).toBe(true);
  await f.bridge.close();
});
it('Window refusal erases copied journal material without finishing opening', async () => {
  const f = fixture(false, true);
  await expect(
    f.bridge.factory(f.carrier, 'actual-native-device', f.options, f.owner),
  ).rejects.toThrow('Window mirror refused');
  expect(f.key.every((v) => v === 0)).toBe(true);
  expect(f.bridge.ready).toBe(false);
  expect(f.events).not.toContain('finish-opening');
  await f.bridge.close();
});
it('missing or different native owners and premature hints cannot acquire the composition', async () => {
  const f = fixture();
  await expect(f.bridge.factory(f.carrier, 'actual-native-device', f.options)).rejects.toThrow(
    'owner changed',
  );
  await expect(
    f.bridge.factory({} as AdmissionCarrier, 'actual-native-device', f.options, f.owner),
  ).rejects.toThrow('owner changed');
  expect(() =>
    f.bridge.methods.workspaceHint({ sequence: 1, status: status(), changed: false, local: false }),
  ).toThrow('unavailable');
  expect(f.copies()).toBe(0);
  expect(f.events).toEqual([]);
  await f.bridge.close();
});
it('cancellation during Window bootstrap cannot finish opening or retain journal keys', async () => {
  const f = fixture(true),
    work = f.bridge.factory(f.carrier, 'actual-native-device', f.options, f.owner);
  await Promise.resolve();
  await Promise.resolve();
  f.stop.abort();
  f.openingGate.resolve();
  await expect(work).rejects.toThrow();
  expect(f.bridge.ready).toBe(false);
  expect(f.key.every((v) => v === 0)).toBe(true);
  await f.bridge.close();
});
