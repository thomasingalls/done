// @vitest-environment node
/** Lock wiring model; two actual Window clients are checked separately in native evidence. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  openWindowCeremonyCohort,
  openWindowAccountCohort,
  createAccountWorkerJoin,
} from '../src/crdt/accountWorkerCohort';
import { openCeremonyWorkerLifetime } from '../src/crdt/ceremonyWorkerLifetime';
import { openLocalWorkerLifetime } from '../src/crdt/localWorkerLifetime';
import { cohortNames } from '../src/crdt/nativeCoordination';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  vi.unstubAllGlobals();
});
function wiring() {
  const held: LockInfo[] = [];
  let client = 'window';
  const request = vi.fn(
    async (name: string, options: LockOptions, callback: (v: Lock | null) => unknown) => {
      const mode = options.mode ?? 'exclusive';
      if (held.some((v) => v.name === name && (v.mode === 'exclusive' || mode === 'exclusive'))) {
        if (options.ifAvailable) return callback(null);
        throw Error('conflicting modeled native lock');
      }
      const value = { name, mode, clientId: client };
      held.push(value);
      try {
        return await callback({ name, mode } as Lock);
      } finally {
        held.splice(held.indexOf(value), 1);
      }
    },
  );
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', { locks: { request, query: async () => ({ held, pending: [] }) } });
  return {
    held,
    request,
    worker() {
      client = 'worker';
      vi.stubGlobal('window', undefined);
    },
  };
}
it('read-only ceremony supervision and exclusive Account reservation use different lock names', async () => {
  const f = wiring(),
    ceremony = await openWindowCeremonyCohort('separate', async () => {});
  cleanups.push(() => ceremony.close());
  const account = await openWindowAccountCohort('separate', async () => {});
  cleanups.unshift(() => account.close());
  const n = cohortNames('separate', ceremony.ticket.incarnation);
  expect(f.held).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: n.ceremonyReservation, mode: 'shared' }),
      expect.objectContaining({ name: n.reservation, mode: 'exclusive' }),
    ]),
  );
  expect(f.held.filter((v) => v.name === n.slot)).toHaveLength(1);
});
it('native ceremony requires its own actual Window reservation, rather than accepting the Account reservation', async () => {
  const f = wiring(),
    ceremony = await openWindowCeremonyCohort('native-role', async () => {});
  cleanups.push(() => ceremony.close());
  const n = cohortNames('native-role', ceremony.ticket.incarnation);
  f.held.find((v) => v.name === n.ceremonyReservation)!.name = n.reservation;
  f.worker();
  await expect(openCeremonyWorkerLifetime(ceremony.ticket)).rejects.toThrow('inactive');
  expect(f.request.mock.calls.some(([name]) => name === n.member)).toBe(false);
});
it('a real ceremony ticket cannot acquire an Account or Local editing lifetime', async () => {
  const f = wiring(),
    ceremony = await openWindowCeremonyCohort('wrong-role', async () => {});
  cleanups.push(() => ceremony.close());
  const n = cohortNames('wrong-role', ceremony.ticket.incarnation);
  f.worker();
  const operation = vi.fn();
  await expect(
    createAccountWorkerJoin(ceremony.ticket).request(n.slot, { mode: 'shared' }, operation),
  ).rejects.toThrow('inactive');
  await expect(openLocalWorkerLifetime(ceremony.ticket)).rejects.toThrow('inactive');
  expect(operation).not.toHaveBeenCalled();
  expect(f.request.mock.calls.some(([name]) => name === n.slot || name === n.member)).toBe(false);
});
