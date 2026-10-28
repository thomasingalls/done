// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createPreparationJournal } from '../src/crdt/retentionPreparation';
const context = '01'.repeat(32),
  current = () => {};
afterEach(() => vi.restoreAllMocks());
it('input mutation while hashing cannot bind verification of newer bytes to an older digest', async () => {
  const j = createPreparationJournal({ context, current }),
    input = new Uint8Array([1, 2]),
    check = vi.fn(async () => {});
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let ready!: () => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    await new Promise<void>((r) => {
      ready = r;
    });
    return digest(...args);
  });
  const work = j.memo.check('spool:1', 'scope', [input], check, current);
  await vi.waitFor(() => expect(ready).toBeTypeOf('function'));
  input[0] = 9;
  ready();
  await expect(work).rejects.toThrow('input changed');
  expect(check).not.toHaveBeenCalled();
  expect(j.statistics.pending).toBe(0);
  j.dispose();
});
it('input mutation during verification cannot persist a result under its previous input', async () => {
  const j = createPreparationJournal({ context, current }),
    input = new Uint8Array([1]);
  let done!: () => void;
  const work = j.memo.check(
    'spool:1',
    'scope',
    [input],
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
    current,
  );
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  input[0] = 2;
  done();
  await expect(work).rejects.toThrow('input changed');
  expect(j.statistics.entries).toBe(0);
  expect(input[0]).toBe(2);
  j.dispose();
});
it('mutation of the input list itself cannot leave a successful partial binding', async () => {
  const j = createPreparationJournal({ context, current }),
    inputs = [new Uint8Array([1])];
  let done!: () => void;
  const work = j.memo.check(
    'spool:1',
    'scope',
    inputs,
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
    current,
  );
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  inputs.push(new Uint8Array([2]));
  done();
  await expect(work).rejects.toThrow('input changed');
  expect(j.statistics.pending).toBe(0);
  j.dispose();
});
