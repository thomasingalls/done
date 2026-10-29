// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  cohortNames,
  localWorkerPinName,
  type AccountWorkerTicket,
} from '../src/crdt/nativeCoordination';
import type { WorkerChannel } from '../src/crdt/workerChannel';
vi.mock('../src/crdt/storageCompatibility', () => ({
  checkStorageCompatibility: vi.fn(async () => {}),
}));
afterEach(() => vi.unstubAllGlobals());
async function environment() {
  vi.resetModules();
  const ticket: AccountWorkerTicket = {
      v: 1,
      slotId: 'local-runtime',
      incarnation: crypto.randomUUID().replaceAll('-', ''),
      windowClient: 'window',
    },
    n = cohortNames(ticket.slotId, ticket.incarnation);
  const held: LockInfo[] = [
    { name: n.reservation, mode: 'shared', clientId: 'window' },
    { name: n.anchor, mode: 'exclusive', clientId: 'window' },
    { name: n.slot, mode: 'shared', clientId: 'window' },
  ];
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      const row: LockInfo = { name, mode: options.mode ?? 'exclusive', clientId: 'worker' };
      held.push(row);
      try {
        return await callback({ name, mode: row.mode! } as Lock);
      } finally {
        held.splice(held.indexOf(row), 1);
      }
    },
  );
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('postMessage', () => {});
  vi.stubGlobal('navigator', { locks: { query: async () => ({ held, pending: [] }), request } });
  const channel = { closed: false, request: vi.fn() } as unknown as WorkerChannel;
  const module = await import('../src/crdt/accountWorkerRuntime');
  const native = await module.installLocalWorkerRuntime(ticket, channel, {
    online: true,
    visibility: 'visible',
  });
  const sessions = await import('../src/crdt/writeSession');
  return {
    ...native,
    ticket,
    n,
    held,
    channel,
    sessions,
    pin: () =>
      held.push({
        name: localWorkerPinName(ticket, 'worker'),
        mode: 'exclusive',
        clientId: 'window',
      }),
  };
}
it('retained Local phases repeat original initialization and disposal under real shared native callbacks', async () => {
  const e = await environment();
  e.pin();
  const initialize = vi.fn(async () => {}),
    dispose = vi.fn();
  for (let i = 0; i < 2; i++) {
    const s = await e.sessions.openWriteSession(e.ticket.slotId, { initialize, dispose });
    expect(await s.run((t) => t.step(() => 7))).toBe(7);
    await s.close();
  }
  expect(initialize).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledTimes(2);
  await e.root.close();
});
it('original Local initialization cannot start without the native Window client pin', async () => {
  const e = await environment(),
    initialize = vi.fn(),
    dispose = vi.fn();
  await expect(
    e.sessions.openWriteSession(e.ticket.slotId, { initialize, dispose }),
  ).rejects.toThrow();
  expect(initialize).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  await e.root.close();
});
it('Local root withdrawal cancels original active session and expires its tasks before release', async () => {
  const e = await environment();
  e.pin();
  const dispose = vi.fn(),
    s = await e.sessions.openWriteSession(e.ticket.slotId, { initialize: () => {}, dispose });
  e.root.beforeRelease(() => s.close());
  await e.root.close();
  expect(s.signal.aborted).toBe(true);
  expect(s.state).toBe('closed');
  expect(dispose).toHaveBeenCalledOnce();
  expect(() => s.write(() => 1)).toThrow();
  expect(e.held.some((v) => v.clientId === 'worker')).toBe(false);
});
it('a canceled original Local phase never initializes, while root remains independently closeable', async () => {
  const e = await environment();
  e.pin();
  const initialize = vi.fn();
  await expect(
    e.sessions.openWriteSession(e.ticket.slotId, {
      signal: AbortSignal.abort(),
      initialize,
      dispose: () => {},
    }),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(initialize).not.toHaveBeenCalled();
  await e.root.close();
});

it('Local root refuses exclusive transitions and Account opening before any original initializer', async () => {
  const e = await environment();
  e.pin();
  const operation = vi.fn(),
    initialize = vi.fn();
  await expect(e.sessions.withExclusiveSlot(e.ticket.slotId, operation)).rejects.toMatchObject({
    code: 'inactive',
  });
  expect(() =>
    e.sessions.openAccountWriteSession(e.ticket.slotId, 'incorrect-disposable-code', {
      initialize,
      dispose: () => {},
    }),
  ).toThrow('separate native owner');
  expect(operation).not.toHaveBeenCalled();
  expect(initialize).not.toHaveBeenCalled();
  await e.root.close();
});
