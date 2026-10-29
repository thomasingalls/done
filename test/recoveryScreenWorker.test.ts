// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createWorkerAccountRecovery } from '../src/ui/accountRecoveryWorker';
import type { WindowCeremonyUiOptions } from '../src/ui/windowCeremonyUi';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/ui/windowCeremonyUi', () => ({ createWindowCeremonyUi: mocks.create }));
beforeEach(() => mocks.create.mockReset());
function fixture() {
  const api = {
    getSnapshot: vi.fn(() => ({
      state: { step: 'save-code', generated: 'fictional-display', accountId: 'account', error: '' },
    })),
    subscribe: vi.fn(),
    registerEditor: vi.fn(),
    busy: false,
    requiresUnlock: false,
    command: vi.fn(async () => {}),
    send: vi.fn(),
    close: vi.fn(async () => {}),
  };
  mocks.create.mockReturnValue(api);
  const stop = new AbortController(),
    owner = createWorkerAccountRecovery(
      { networkSessions: true } as never,
      'enrollment-' + '12'.repeat(16),
      stop.signal,
    );
  const options = mocks.create.mock.calls[0]![2] as WindowCeremonyUiOptions<unknown>;
  return { api, owner, options, stop };
}
it('selects exact joined Worker entry and an inspect-only reboot with no retained factor or fresh approval', () => {
  const f = fixture();
  expect(f.options.expectedJoined).toBe(true);
  expect(f.options.bootstrapKind).toBe('recoveryBootstrap');
  expect(f.options.retryCommand).toEqual({ command: 'inspect' });
  expect(f.options).not.toHaveProperty('takeInitialCode');
  expect(f.options).not.toHaveProperty('data');
  expect(f.options.captureCommand({ command: 'unlock', value: 'new-user-input' })).toEqual({
    command: 'unlock',
    value: 'new-user-input',
  });
});
it('permits only save/confirm navigation while an owned display exists and no command is active', () => {
  const f = fixture();
  expect(f.owner.visit('confirm-code')).toBe(true);
  expect(f.api.send).toHaveBeenCalledExactlyOnceWith({ command: 'visit', value: 'confirm-code' });
  expect(f.owner.visit('review')).toBe(false);
  f.api.busy = true;
  expect(f.owner.visit('save-code')).toBe(false);
  expect(f.api.send).toHaveBeenCalledTimes(1);
});
it('cannot turn an editor projection into a workspace without the actual composed session', () => {
  const f = fixture();
  expect(() =>
    f.options.capture(
      {
        state: {
          step: 'editing',
          accountId: 'account',
          generated: '',
          error: '',
          editor: { actorId: 'actor', accountId: 'account' },
        },
      },
      undefined,
    ),
  ).toThrow('Canonical recovery workspace unavailable');
});
it('aborting the screen immediately closes its owned native supervisor', async () => {
  const f = fixture();
  f.stop.abort();
  expect(f.api.close).toHaveBeenCalledTimes(1);
  await f.owner.close();
  expect(f.api.close).toHaveBeenCalledTimes(2);
});
