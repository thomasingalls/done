// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createNativeEnrollmentController } from '../src/crdt/workerEnrollment';
import type { NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/account/accountEnrollment', () => ({
  createAccountEnrollmentCoordinator: mocks.create,
}));
vi.mock('../src/account/networkLogin', () => ({
  NetworkLogin: class {
    close() {}
  },
}));
beforeEach(() => mocks.create.mockReset());
it('reports the original refusal after native work settles without advancing saved state or authorizing an opening', async () => {
  const refresh = vi
      .fn()
      .mockRejectedValueOnce(Error('Saved participant differs from this device.'))
      .mockResolvedValueOnce({ kind: 'waiting', message: 'Waiting' }),
    close = vi.fn(async () => {}),
    execution = { open: vi.fn() };
  mocks.create.mockResolvedValue({ refresh, close });
  const context = {
    config: {},
    slotId: 'local',
    signal: new AbortController().signal,
    takeInitialCode: () => 'fictional-code',
    data: { role: 'existing' },
    browser: {},
    execution,
    publish: vi.fn(),
    runBackground: async (operation: () => Promise<unknown>) => operation(),
    beforeAccountOpen: vi.fn(),
  } as unknown as NativeCeremonyUiContext;
  const owner = createNativeEnrollmentController(context);
  await owner.command({ command: 'initialize' }).run();
  await owner.command({ command: 'refresh' }).run();
  const refused = owner.snapshot();
  expect(refused['error']).toBe('Saved participant differs from this device.');
  expect(refused['state']).toEqual({ kind: 'locked', message: 'Unlock this device to continue.' });
  expect(execution.open).not.toHaveBeenCalled();
  await owner.command({ command: 'refresh' }).run();
  expect(owner.snapshot()['error']).toBe('');
  expect(owner.snapshot()['state']).toEqual({ kind: 'waiting', message: 'Waiting' });
  await owner.close();
});
