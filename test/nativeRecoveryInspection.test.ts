// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createNativeLostRecoveryController } from '../src/crdt/workerLostDeviceRecovery';
import type { NativeCeremonyUiContext } from '../src/crdt/workerCeremonyUi';
const mocks = vi.hoisted(() => ({ begin: vi.fn(), inspect: vi.fn() }));
vi.mock('../src/account/lostDeviceRecovery', () => ({
  beginLostDeviceRecovery: mocks.begin,
  resumeLostDeviceRecovery: vi.fn(),
  finishLostDeviceRecovery: vi.fn(),
  openRecoveredWorkspaceWithExecution: vi.fn(),
}));
vi.mock('../src/crdt/localGenesis', () => ({ inspectLocalStartup: mocks.inspect }));
it('failed storage inspection exposes unlock/refusal without authorizing fresh recovery or assuming empty data', async () => {
  mocks.inspect.mockRejectedValue(Error('Saved storage could not be read.'));
  const owner = createNativeLostRecoveryController({
    slotId: 'enrollment-' + '12'.repeat(16),
    signal: new AbortController().signal,
  } as NativeCeremonyUiContext);
  await owner.command({ command: 'inspect' }).run();
  expect(owner.snapshot()).toEqual({
    state: {
      step: 'unlock',
      accountId: '',
      generated: '',
      error: 'Saved storage could not be read.',
    },
  });
  await owner.command({ command: 'begin' }).run();
  expect(mocks.begin).not.toHaveBeenCalled();
  expect((owner.snapshot()['state'] as { step: string }).step).toBe('unlock');
  await owner.close();
});
