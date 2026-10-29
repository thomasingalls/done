// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { inspectWorkerStartup, preparePendingDeviceInWorker } from '../src/ui/pendingDeviceWorker';
const mocks = vi.hoisted(() => ({ open: vi.fn(), pending: vi.fn(), remember: vi.fn() }));
vi.mock('../src/crdt/localStartupClient', () => ({ openLocalStartupWorker: mocks.open }));
vi.mock('../src/account/deviceConnectionRoutes', () => ({
  pendingDeviceSlot: mocks.pending,
  rememberPendingDevice: mocks.remember,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending.mockReturnValue('enrollment-' + '12'.repeat(16));
});
function fixture() {
  const enrollment = { displayCode: 'fictional-factor', confirm: vi.fn(), cancel: vi.fn() },
    owner = {
      inspect: vi.fn(async () => ({ kind: 'fresh' })),
      beginGenesis: vi.fn(async () => enrollment),
      close: vi.fn(async () => {}),
    };
  mocks.open.mockResolvedValue(owner);
  return { owner, enrollment, signal: new AbortController().signal };
}
it('inspects the actual selected worker and releases its native lifetime after read-only inspection', async () => {
  const f = fixture();
  expect(await inspectWorkerStartup('local', f.signal)).toEqual({ kind: 'fresh' });
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith('local', f.signal);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
it('persists only the public route after fresh inspection and retains the original worker confirmation endpoint', async () => {
  const f = fixture(),
    workspace = 'ab'.repeat(16);
  const p = await preparePendingDeviceInWorker(workspace, f.signal);
  expect(p.enrollment).toBe(f.enrollment);
  expect(mocks.remember).toHaveBeenCalledExactlyOnceWith(workspace, p.slot);
  expect(f.owner.inspect.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.remember.mock.invocationCallOrder[0]!,
  );
  expect(mocks.remember.mock.invocationCallOrder[0]).toBeLessThan(
    f.owner.beginGenesis.mock.invocationCallOrder[0]!,
  );
  expect(f.owner.beginGenesis).toHaveBeenCalledExactlyOnceWith(false);
  expect(f.owner.close).not.toHaveBeenCalled();
  await Promise.all([p.close(), p.close()]);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
it('never replaces real retained data and drains native inspection failures', async () => {
  const f = fixture();
  f.owner.inspect.mockResolvedValue({ kind: 'migration-required' });
  await expect(preparePendingDeviceInWorker('ab'.repeat(16), f.signal)).rejects.toThrow(
    'migration',
  );
  expect(f.owner.beginGenesis).not.toHaveBeenCalled();
  expect(mocks.remember).not.toHaveBeenCalled();
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
it('retains the same confirmation endpoint after wrong-code refusal until explicit close', async () => {
  const f = fixture(),
    p = await preparePendingDeviceInWorker('ab'.repeat(16), f.signal);
  f.enrollment.confirm.mockRejectedValueOnce(Error('wrong code'));
  await expect(p.enrollment.confirm('wrong')).rejects.toThrow();
  expect(p.enrollment.displayCode).toBe('fictional-factor');
  expect(f.owner.close).not.toHaveBeenCalled();
  await p.close();
});
it('joins a late failed preparation on abort before returning any code', async () => {
  const f = fixture(),
    stop = new AbortController();
  f.owner.beginGenesis.mockImplementation(async () => {
    stop.abort();
    return f.enrollment;
  });
  await expect(preparePendingDeviceInWorker('ab'.repeat(16), stop.signal)).rejects.toThrow();
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
