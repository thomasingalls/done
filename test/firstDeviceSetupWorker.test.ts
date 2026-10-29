// @vitest-environment node
/** Window pre-bootstrap lifecycle only; fake roots never enter a native or journal operation. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkerFirstDeviceSetup } from '../src/ui/firstDeviceSetupWorker';
import type { SetupConfig } from '../src/account/setupProgress';
const mocked = vi.hoisted(() => ({ open: vi.fn(), journal: vi.fn() }));
vi.mock('../src/crdt/accountWorkerCohort', async (actual) => ({
  ...(await actual<typeof import('../src/crdt/accountWorkerCohort')>()),
  openWindowCeremonyCohort: mocked.open,
}));
vi.mock('../src/crdt/windowCeremonyJournal', () => ({
  createWindowCeremonyJournal: mocked.journal,
}));
const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://fixture.test',
    rpId: 'fixture.test',
    serviceId: 'ab'.repeat(16),
    authRoot: 'cd'.repeat(32),
  },
};
beforeEach(() => {
  vi.stubGlobal('location', { origin: config.pin.origin });
  mocked.open.mockReset();
  mocked.journal.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((resolve_) => (resolve = resolve_));
  return { promise, resolve };
}
it('private mode and foreign origin refuse before reserving a Window root', () => {
  expect(() =>
    createWorkerFirstDeviceSetup({ pin: config.pin, networkSessions: false, token: {} as never }),
  ).toThrow('public account sessions');
  vi.stubGlobal('location', { origin: 'https://foreign.test' });
  expect(() => createWorkerFirstDeviceSetup(config)).toThrow('origin');
  expect(mocked.open).not.toHaveBeenCalled();
});
it('close during root acquisition withdraws the UI immediately and joins late actual cleanup before returning', async () => {
  const opening = deferred(),
    cleanup = deferred(),
    construct = vi.fn();
  vi.stubGlobal('Worker', construct);
  mocked.open.mockReturnValue(opening.promise);
  const owner = createWorkerFirstDeviceSetup(config),
    inspecting = owner.inspect();
  const refused = expect(inspecting).rejects.toThrow('aborted');
  await Promise.resolve();
  let closed = false;
  const originalClose = owner.close();
  const closing = originalClose.then(() => (closed = true));
  expect(owner.getSnapshot()).toEqual({
    kind: 'working',
    message: 'Locking and finishing storage operations…',
  });
  expect(owner.hasRecoveryDisplay()).toBe(false);
  expect(owner.visitableSteps()).toEqual([]);
  const close = vi.fn(() => cleanup.promise);
  opening.resolve({ close });
  await refused;
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(construct).not.toHaveBeenCalled();
  expect(mocked.journal).not.toHaveBeenCalled();
  cleanup.resolve(undefined);
  await closing;
  expect(close).toHaveBeenCalledOnce();
  expect(closed).toBe(true);
  expect(owner.close()).toBe(originalClose);
});
it('late root cleanup failure stays a failed close rather than fabricating completion', async () => {
  const opening = deferred();
  mocked.open.mockReturnValue(opening.promise);
  const owner = createWorkerFirstDeviceSetup(config),
    inspecting = owner.inspect();
  const refused = inspecting.catch(() => {}),
    closing = owner.close();
  opening.resolve({ close: () => Promise.reject(Error('native cleanup failed')) });
  await refused;
  await expect(closing).rejects.toThrow('native cleanup failed');
  expect(mocked.journal).not.toHaveBeenCalled();
});
