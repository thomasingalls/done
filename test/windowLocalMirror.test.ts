// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createWindowLocalMirror } from '../src/crdt/windowLocalMirror';
import {
  openWindowLocalCohort,
  openWindowAccountCohort,
  requireWindowAccountCohort,
  requireWindowLocalCohort,
} from '../src/crdt/accountWorkerCohort';
import type { LocalMirrorOpening, openLocalWorkerSession } from '../src/crdt/localWorkerClient';
import { cohortNames } from '../src/crdt/nativeCoordination';
afterEach(() => vi.unstubAllGlobals());
function opening(incarnation = '12'.repeat(16)): LocalMirrorOpening {
  return {
    incarnation,
    scope: {
      slotId: 'local-unit',
      principalId: '11'.repeat(16),
      workspaceId: '22'.repeat(16),
      storeId: '33'.repeat(16),
      rootId: '44'.repeat(16),
    },
    dbName: 'done.' + '55'.repeat(16),
    generation: 1,
    key: new Uint8Array(32).fill(7),
    previous: [],
  };
}
const worker = () =>
  ({ loadRecovery: vi.fn(), appendBatch: vi.fn(), flushJournal: vi.fn() }) as unknown as Awaited<
    ReturnType<typeof openLocalWorkerSession>
  >['worker'];
const options = () => ({
  identity: {
    id: '11'.repeat(16),
    actor: { kind: 'human' as const, name: 'Test', color: '#e0662f' },
    device: { id: 'local-test', name: 'Fictional' },
  },
});
async function cohort(local = true, pin = true) {
  const held: LockInfo[] = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (name: string, o: LockOptions, callback: (lock: Lock) => unknown) => {
        const row: LockInfo = { name, mode: o.mode ?? 'exclusive', clientId: 'window' };
        held.push(row);
        try {
          return await callback({ name, mode: row.mode! } as Lock);
        } finally {
          held.splice(held.indexOf(row), 1);
        }
      },
    },
  });
  const root = await (local ? openWindowLocalCohort : openWindowAccountCohort)(
    'local-unit',
    async () => {
      for (let i = held.length - 1; i >= 0; i--)
        if (held[i]!.clientId === 'worker') held.splice(i, 1);
    },
  );
  if (local && pin) {
    const n = cohortNames(root.ticket.slotId, root.ticket.incarnation);
    held.push(
      { name: n.member, mode: 'exclusive', clientId: 'worker' },
      { name: n.slot, mode: 'shared', clientId: 'worker' },
    );
    await root.bindLocalWorker();
  }
  return root;
}
it('forged Local coordinator cannot execute its supplied write capability and incoming keys erase', async () => {
  const write = vi.fn(),
    material = opening(),
    io = worker();
  await expect(
    createWindowLocalMirror(
      { write } as unknown as Awaited<ReturnType<typeof cohort>>,
      material,
      io,
      options(),
    ),
  ).rejects.toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
  expect(material.key.every((v) => v === 0)).toBe(true);
  expect(io.loadRecovery).not.toHaveBeenCalled();
});
it('Account and pinned Local coordinators cannot substitute for one another', async () => {
  const a = await cohort(false);
  expect(() => requireWindowLocalCohort(a)).toThrow('inactive');
  const material = opening(a.ticket.incarnation);
  await expect(createWindowLocalMirror(a, material, worker(), options())).rejects.toThrow(
    'inactive',
  );
  await a.close();
  const l = await cohort();
  expect(() => requireWindowAccountCohort(l)).toThrow('inactive');
  expect(() => requireWindowLocalCohort(l)).not.toThrow();
  await l.close();
});
it('Local coordinator alone without actual Worker pin cannot initialize a mirror', async () => {
  const root = await cohort(true, false),
    material = opening(root.ticket.incarnation),
    io = worker();
  await expect(createWindowLocalMirror(root, material, io, options())).rejects.toThrow('inactive');
  expect(io.loadRecovery).not.toHaveBeenCalled();
  await root.close();
});
it('wrong scoped incarnation and principal refuse before recovery, close root and erase incoming copies', async () => {
  for (const fault of ['incarnation', 'principal']) {
    const root = await cohort(),
      material = opening(root.ticket.incarnation),
      io = worker();
    if (fault === 'incarnation') Object.assign(material, { incarnation: 'ff'.repeat(16) });
    else Object.assign(material.scope, { principalId: 'ff'.repeat(16) });
    await expect(createWindowLocalMirror(root, material, io, options())).rejects.toThrow(
      'not bound',
    );
    expect(root.state).toBe('closed');
    expect(material.key.every((v) => v === 0)).toBe(true);
    expect(io.loadRecovery).not.toHaveBeenCalled();
  }
});
it('opening accessors refuse without getter execution and owned ordinary keys erase', async () => {
  const root = await cohort(),
    material = opening(root.ticket.incarnation),
    get = vi.fn();
  Object.defineProperty(material, 'dbName', { get });
  await expect(createWindowLocalMirror(root, material, worker(), options())).rejects.toThrow(
    'not bound',
  );
  expect(get).not.toHaveBeenCalled();
  expect(material.key.every((v) => v === 0)).toBe(true);
  expect(root.state).toBe('closed');
});
