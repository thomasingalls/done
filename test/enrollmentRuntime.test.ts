// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createUiAccountEnrollment } from '../src/ui/accountEnrollmentRuntime';
const mocks = vi.hoisted(() => ({ worker: vi.fn(), page: vi.fn() }));
vi.mock('../src/ui/accountEnrollmentWorker', () => ({
  createWorkerAccountEnrollment: mocks.worker,
}));
vi.mock('../src/ui/accountEnrollmentPage', () => ({ createLegacyUiEnrollment: mocks.page }));
beforeEach(() => vi.clearAllMocks());
it('public screen forwards exact factor, native role, lifetime and progress only to fixed Worker factory', async () => {
  const config = { networkSessions: true },
    data = { role: 'new', workspaceId: 'fixture' },
    signal = new AbortController().signal,
    progress = vi.fn(),
    owner = { native: true };
  mocks.worker.mockResolvedValue(owner);
  expect(
    await createUiAccountEnrollment(
      config as never,
      'local',
      'fictional-code',
      data as never,
      signal,
      progress,
    ),
  ).toBe(owner);
  expect(mocks.worker).toHaveBeenCalledExactlyOnceWith(
    config,
    'local',
    'fictional-code',
    data,
    signal,
    progress,
  );
  expect(mocks.page).not.toHaveBeenCalled();
});
it('Worker refusal cannot silently invoke the Page owner', async () => {
  mocks.worker.mockRejectedValue(Error('native cleanup required'));
  await expect(
    createUiAccountEnrollment(
      { networkSessions: true } as never,
      'local',
      'fictional-code',
      { role: 'existing' },
      new AbortController().signal,
    ),
  ).rejects.toThrow('native cleanup');
  expect(mocks.page).not.toHaveBeenCalled();
});
it('only explicit legacy service selects original Page compatibility', async () => {
  const config = { networkSessions: false },
    owner = { legacy: true },
    signal = new AbortController().signal;
  mocks.page.mockResolvedValue(owner);
  expect(
    await createUiAccountEnrollment(
      config as never,
      'local',
      'fictional-code',
      { role: 'existing' },
      signal,
    ),
  ).toBe(owner);
  expect(mocks.worker).not.toHaveBeenCalled();
  expect(mocks.page).toHaveBeenCalledExactlyOnceWith(
    config,
    'local',
    'fictional-code',
    { role: 'existing' },
    signal,
    undefined,
  );
});
it('an aborted legacy route cannot acquire a late Page owner after loading its compatibility module', async () => {
  const stop = new AbortController();
  stop.abort();
  await expect(
    createUiAccountEnrollment(
      { networkSessions: false } as never,
      'local',
      'fictional-code',
      { role: 'existing' },
      stop.signal,
    ),
  ).rejects.toThrow();
  expect(mocks.page).not.toHaveBeenCalled();
  expect(mocks.worker).not.toHaveBeenCalled();
});
