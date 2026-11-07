// @vitest-environment node
/** Presentation only. A native transition notice cannot supply a factor, permit or opening. */
import { beforeEach, expect, it, vi } from 'vitest';
import { createWorkerFirstDeviceSetup } from '../src/ui/firstDeviceSetupWorker';
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/ui/windowCeremonyUi', () => ({ createWindowCeremonyUi: mock.create }));
beforeEach(() => vi.clearAllMocks());
function options() {
  mock.create.mockImplementation((_c, _s, o) => ({
    getSnapshot: () => o.initial,
    subscribe: vi.fn(),
    registerEditor: vi.fn(),
    close: vi.fn(),
    whenIdle: vi.fn(),
    command: vi.fn(),
    send: vi.fn(),
  }));
  createWorkerFirstDeviceSetup({ networkSessions: true } as never, 'fixture');
  return mock.create.mock.calls[0]![2];
}
const removed =
  'This device was removed from the account. Unlock it again to open its detached local copy.';
it('keeps Account unlock/passkey wording after an actual native transition without inventing an opening', () => {
  const state = options().failure(false, removed).state;
  expect(state).toEqual({ kind: 'unlock', returning: true, error: removed });
  expect(state).not.toHaveProperty('workspace');
  expect(state).not.toHaveProperty('code');
  expect(state).not.toHaveProperty('accountId');
});
it('ordinary setup failure does not guess that a connected Account has been authenticated', () => {
  const state = options().failure(false).state;
  expect(state.kind).toBe('unlock');
  expect(state).not.toHaveProperty('returning');
  expect(state).not.toHaveProperty('workspace');
});
it('cleanup failure remains blocked even with an otherwise valid native display notice', () => {
  const state = options().failure(true, removed).state;
  expect(state.kind).toBe('storage-blocked');
  expect(state).not.toHaveProperty('returning');
  expect(state).not.toHaveProperty('workspace');
});
