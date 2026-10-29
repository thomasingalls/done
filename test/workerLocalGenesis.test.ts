// @vitest-environment node
/** Enrollment protocol wiring only; actual native/crypto genesis has separate browser checks. */
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/crdt/localGenesis', () => ({ beginLocalGenesis: vi.fn() }));
import { beginLocalGenesis } from '../src/crdt/localGenesis';
import { createWorkerLocalGenesis } from '../src/crdt/workerLocalGenesis';
import type { LocalGenesisEnrollment, LocalGenesisReceipt } from '../src/crdt/localGenesis';
const created = (): LocalGenesisReceipt => ({
  kind: 'created',
  scope: { slotId: 'slot', principalId: 'principal', workspaceId: 'workspace' },
  storeId: 'store',
});
const enrollments: {
  cancel: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  code: string | null;
}[] = [];
beforeEach(() => {
  enrollments.length = 0;
  vi.mocked(beginLocalGenesis).mockImplementation(() => {
    const value = {
      code: 'disposable code' as string | null,
      cancel: vi.fn(() => {
        value.code = null;
      }),
      confirm: vi.fn(async (input: string) => {
        if (input !== value.code)
          throw Object.assign(Error('wrong confirmation'), { code: 'confirmation-required' });
        value.code = null;
        return created();
      }),
    };
    enrollments.push(value);
    return {
      get displayCode() {
        return value.code;
      },
      confirm: value.confirm,
      cancel: value.cancel,
    } as LocalGenesisEnrollment;
  });
});
it('only the fixed slot/signal/automatic options reach original genesis and receipt is ordinary data', async () => {
  const signal = new AbortController().signal,
    g = createWorkerLocalGenesis('fixed-slot', signal);
  expect(g.begin({ id: 1, automatic: true })).toEqual({ code: 'disposable code' });
  expect(beginLocalGenesis).toHaveBeenLastCalledWith('fixed-slot', { signal, automatic: true });
  expect(await g.confirm({ id: 1, code: 'disposable code' })).toEqual(created());
});
it('wrong confirmation preserves the original enrollment and never invents another code', async () => {
  const g = createWorkerLocalGenesis('slot', new AbortController().signal);
  g.begin({ id: 1, automatic: false });
  await expect(g.confirm({ id: 1, code: 'wrong' })).rejects.toMatchObject({
    code: 'confirmation-required',
  });
  expect(enrollments).toHaveLength(1);
  expect(enrollments[0]!.code).toBe('disposable code');
  expect(await g.confirm({ id: 1, code: 'disposable code' })).toEqual(created());
});
it('refused duplicate begin does not consume the next successful enrollment identity', () => {
  const g = createWorkerLocalGenesis('slot', new AbortController().signal);
  g.begin({ id: 1, automatic: false });
  expect(() => g.begin({ id: 2, automatic: false })).toThrow('order');
  g.cancel({ id: 1 });
  expect(g.begin({ id: 2, automatic: false })).toEqual({ code: 'disposable code' });
});
it('late cancellation cannot erase a new enrollment and future identities refuse', () => {
  const g = createWorkerLocalGenesis('slot', new AbortController().signal);
  g.begin({ id: 1, automatic: false });
  g.cancel({ id: 1 });
  g.begin({ id: 2, automatic: false });
  g.cancel({ id: 1 });
  expect(enrollments[1]!.cancel).not.toHaveBeenCalled();
  expect(() => g.cancel({ id: 3 })).toThrow('order');
});
it('root cancellation erases the original enrollment and permanently refuses new work', async () => {
  const stop = new AbortController(),
    g = createWorkerLocalGenesis('slot', stop.signal);
  g.begin({ id: 1, automatic: false });
  stop.abort();
  expect(enrollments[0]!.cancel).toHaveBeenCalledOnce();
  expect(enrollments[0]!.code).toBeNull();
  expect(() => g.begin({ id: 2, automatic: false })).toThrow('closed');
  await expect(g.confirm({ id: 1, code: 'disposable code' })).rejects.toThrow('closed');
});
it('native failure closes only its own enrollment and is never rewritten as successful creation', async () => {
  const g = createWorkerLocalGenesis('slot', new AbortController().signal);
  g.begin({ id: 1, automatic: false });
  enrollments[0]!.confirm.mockRejectedValueOnce(
    Object.assign(Error('native failure'), { code: 'repair-required' }),
  );
  await expect(g.confirm({ id: 1, code: 'disposable code' })).rejects.toMatchObject({
    code: 'repair-required',
  });
  expect(enrollments[0]!.cancel).toHaveBeenCalledOnce();
  expect(g.begin({ id: 2, automatic: false }).code).toBe('disposable code');
});
