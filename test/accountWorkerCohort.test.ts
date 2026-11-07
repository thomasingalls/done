// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAccountWorkerJoin,
  openWindowAccountCohort,
  requireWindowAccountCohort,
} from '../src/crdt/accountWorkerCohort';

afterEach(() => vi.unstubAllGlobals());
const ticket = () => ({
  v: 1 as const,
  slotId: 'slot',
  incarnation: '12'.repeat(16),
  windowClient: 'window-native-client',
});
const native = () => {
  const query = vi.fn(async () => ({ held: [], pending: [] })),
    request = vi.fn();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('navigator', { locks: { query, request } });
  return { query, request };
};
it('refuses a forged Window owner without calling its supplied write capability', () => {
  const write = vi.fn();
  expect(() =>
    requireWindowAccountCohort({ write } as unknown as Parameters<
      typeof requireWindowAccountCohort
    >[0]),
  ).toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
});
it('a worker ticket alone grants no permit when the physical Window leases are absent', async () => {
  const { request } = native(),
    join = createAccountWorkerJoin(ticket()),
    callback = vi.fn();
  await expect(
    join.request('done/slot-writer/"slot"', { mode: 'shared' }, callback),
  ).rejects.toThrow('inactive');
  expect(request).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
it('captures a ticket before the caller can change its scope', async () => {
  native();
  const value = ticket(),
    join = createAccountWorkerJoin(value);
  value.slotId = 'other';
  await expect(
    join.request('done/slot-writer/"other"', { mode: 'shared' }, () => {}),
  ).rejects.toThrow('inactive');
});
it('refuses ticket accessors without invoking their getters', () => {
  native();
  const getter = vi.fn(),
    value = ticket();
  Object.defineProperty(value, 'slotId', { get: getter });
  expect(() => createAccountWorkerJoin(value)).toThrow('inactive');
  expect(getter).not.toHaveBeenCalled();
});
it('refuses extra ticket properties rather than retaining an authority-looking extension', () => {
  native();
  expect(() =>
    createAccountWorkerJoin({ ...ticket(), extra: true } as ReturnType<typeof ticket>),
  ).toThrow('inactive');
});
it('refuses a ticket whose scope exists only on its prototype', () => {
  native();
  expect(() => createAccountWorkerJoin(Object.create(ticket()))).toThrow('inactive');
});
it('refuses malformed or missing incarnation identities', () => {
  native();
  for (const incarnation of ['', 'x'.repeat(32), '12'.repeat(15)])
    expect(() => createAccountWorkerJoin({ ...ticket(), incarnation })).toThrow('inactive');
});
it('refuses malformed protocol and native client identity', () => {
  native();
  expect(() =>
    createAccountWorkerJoin({ ...ticket(), v: 2 } as unknown as ReturnType<typeof ticket>),
  ).toThrow('inactive');
  expect(() => createAccountWorkerJoin({ ...ticket(), windowClient: '' })).toThrow('inactive');
  expect(() => createAccountWorkerJoin({ ...ticket(), windowClient: 'x'.repeat(257) })).toThrow(
    'inactive',
  );
});
it('cannot use a worker join from a Window execution context', () => {
  native();
  vi.stubGlobal('window', {});
  expect(() => createAccountWorkerJoin(ticket())).toThrow('inactive');
});
it('cannot manufacture a Window coordinator in a nonpage context', async () => {
  native();
  await expect(openWindowAccountCohort('slot', async () => {})).rejects.toThrow('inactive');
});
it('refuses insecure worker coordination even when a ticket has valid shape', () => {
  native();
  vi.stubGlobal('isSecureContext', false);
  expect(() => createAccountWorkerJoin(ticket())).toThrow('secure context');
});
it('refuses exclusive worker joins instead of upgrading or stealing a native permit', async () => {
  const { request } = native(),
    join = createAccountWorkerJoin(ticket());
  await expect(
    join.request('done/slot-writer/"slot"', { mode: 'exclusive' }, () => {}),
  ).rejects.toThrow('inactive');
  expect(request).not.toHaveBeenCalled();
});
it('refuses a pre-canceled join before any native request or initialization', async () => {
  const { query, request } = native(),
    join = createAccountWorkerJoin(ticket()),
    callback = vi.fn();
  await expect(
    join.request(
      'done/slot-writer/"slot"',
      { mode: 'shared', signal: AbortSignal.abort() },
      callback,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(query).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
it('one join strategy cannot be retried after a failed acquisition', async () => {
  const { query } = native(),
    join = createAccountWorkerJoin(ticket());
  await expect(
    join.request('done/slot-writer/"slot"', { mode: 'shared' }, () => {}),
  ).rejects.toThrow();
  await expect(
    join.request('done/slot-writer/"slot"', { mode: 'shared' }, () => {}),
  ).rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(1);
});
