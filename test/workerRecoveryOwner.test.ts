// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createWorkerRecoveryOwner } from '../src/crdt/workerRecoveryOwner';
const recovery = () => ({
  records: [{ kind: 'update' as const, gen: 1, seq: 1, bytes: new Uint8Array([1, 2, 3]) }],
  journal: [],
});
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it('claims asynchronous loading before await so a second begin cannot replace live plaintext', async () => {
  const wait = deferred<ReturnType<typeof recovery>>(),
    load = vi.fn(() => wait.promise),
    owner = createWorkerRecoveryOwner(load, () => {}),
    first = owner.begin();
  await expect(owner.begin()).rejects.toThrow('busy');
  expect(load).toHaveBeenCalledOnce();
  const source = recovery();
  wait.resolve(source);
  const opened = await first;
  expect(source.records[0]!.bytes.every((v) => v === 0)).toBe(true);
  const page = owner.page({ id: opened.id });
  expect([...page.parts[0]!.bytes]).toEqual([1, 2, 3]);
  owner.finish({ id: opened.id });
  owner.close();
});
it('close during native load erases the eventual plaintext and cannot publish a stream', async () => {
  const wait = deferred<ReturnType<typeof recovery>>(),
    owner = createWorkerRecoveryOwner(
      () => wait.promise,
      () => {},
    ),
    first = owner.begin();
  owner.close();
  const source = recovery();
  wait.resolve(source);
  await expect(first).rejects.toThrow('closed');
  expect(source.records[0]!.bytes.every((v) => v === 0)).toBe(true);
  expect(() => owner.page({ id: 1 })).toThrow('closed');
});
it('failed read clears only its loading reservation and later read uses a fresh identity', async () => {
  const load = vi
      .fn()
      .mockRejectedValueOnce(Error('native read refused'))
      .mockResolvedValueOnce(recovery()),
    owner = createWorkerRecoveryOwner(load, () => {});
  await expect(owner.begin()).rejects.toThrow('native read refused');
  const next = await owner.begin();
  expect(next.id).toBe(1);
  owner.finish({ id: next.id });
  owner.close();
});
it('stale finish and malformed ids cannot close the current stream', async () => {
  const owner = createWorkerRecoveryOwner(
      async () => recovery(),
      () => {},
    ),
    first = await owner.begin();
  owner.finish({ id: first.id });
  const next = await owner.begin();
  for (const v of [{ id: first.id }, { id: next.id, extra: true }, { id: NaN }, null])
    expect(() => owner.finish(v)).toThrow('changed');
  expect(owner.page({ id: next.id }).parts.length).toBe(1);
  owner.close();
});
it('complete paging still reserves ownership until explicit finish, and close is terminal', async () => {
  const owner = createWorkerRecoveryOwner(
      async () => recovery(),
      () => {},
    ),
    first = await owner.begin();
  expect(owner.page({ id: first.id }).done).toBe(true);
  await expect(owner.begin()).rejects.toThrow('busy');
  owner.finish({ id: first.id });
  const next = await owner.begin();
  expect(next.id).toBe(first.id + 1);
  owner.close();
  await expect(owner.begin()).rejects.toThrow('closed');
});
