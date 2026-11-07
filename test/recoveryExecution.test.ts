// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import {
  openRecoveredWorkspaceWithExecution,
  openRecoveredWorkspace,
} from '../src/account/lostDeviceRecovery';
const mocks = vi.hoisted(() => ({
  joined: vi.fn(),
  close: vi.fn(),
  created: vi.fn(),
  open: vi.fn(),
  assert: vi.fn(),
}));
vi.mock('../src/crdt/joinedAccount', () => ({ hasJoinedAccount: mocks.joined }));
vi.mock('../src/account/networkLogin', () => ({
  NetworkLogin: class {
    constructor(...args: unknown[]) {
      mocks.created(...args);
    }
    close = mocks.close;
  },
  postSession: vi.fn(),
}));
vi.mock('../src/account/enrollmentExecution', () => ({
  pageEnrollmentWorkspace: { open: mocks.open },
}));
vi.mock('../src/account/assertSlotPasskey', () => ({ assertSlotPasskey: mocks.assert }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.joined.mockResolvedValue({ principalId: 'fictional-principal' });
});
const config = {
  pin: { origin: 'https://fictional.test', rpId: 'fictional.test' },
  networkSessions: true,
} as never;
it('passes exact one-use recovery approval, factor, native assertion and joined role to the original execution boundary', async () => {
  const stop = new AbortController(),
    opening = Object.freeze({ kind: 'fresh-recovery-opening' }),
    assert = vi.fn(),
    factory = vi.fn(() => assert),
    result = { workspace: {}, devices: {}, accountId: 'account' };
  const open = vi.fn(async () => result);
  const value = await openRecoveredWorkspaceWithExecution(
    { open } as never,
    factory,
    config,
    'enrollment-fictional',
    'fixture-code',
    stop.signal,
    opening as never,
  );
  expect(mocks.joined).toHaveBeenCalledExactlyOnceWith(
    'enrollment-fictional',
    'fixture-code',
    stop.signal,
  );
  expect(factory).toHaveBeenCalledExactlyOnceWith(stop.signal);
  const args = open.mock.calls[0] as unknown as [Record<string, unknown>, unknown, boolean];
  expect(args[2]).toBe(true);
  expect(args[0]).toMatchObject({
    slotId: 'enrollment-fictional',
    code: 'fixture-code',
    signal: stop.signal,
    membershipContinuation: true,
  });
  expect(args[0]['recoveryOpening']).toBe(opening);
  expect(args[0]['assertPasskey']).toBe(assert);
  expect((args[0]['identity'] as { id: string }).id).toBe('fictional-principal');
  expect(value.editor).toBe(result);
  expect(value.actorId).toBe('fictional-principal');
});
it('refuses incomplete installation before constructing a login or opening a workspace', async () => {
  mocks.joined.mockResolvedValue(null);
  const open = vi.fn();
  await expect(
    openRecoveredWorkspaceWithExecution(
      { open } as never,
      vi.fn(),
      config,
      'enrollment-fictional',
      'fixture-code',
      new AbortController().signal,
    ),
  ).rejects.toThrow('incomplete');
  expect(mocks.created).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
it('retains Page entry native factory and retires its login if workspace opening refuses', async () => {
  mocks.assert.mockReturnValue(vi.fn());
  mocks.open.mockRejectedValue(Error('original refusal'));
  await expect(
    openRecoveredWorkspace(
      config,
      'enrollment-fictional',
      'fixture-code',
      new AbortController().signal,
    ),
  ).rejects.toThrow('original refusal');
  expect(mocks.open).toHaveBeenCalledTimes(1);
  expect(mocks.assert).toHaveBeenCalledTimes(1);
  expect(mocks.close).toHaveBeenCalledTimes(1);
});
